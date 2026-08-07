"use client";

/**
 * @file `useVariantAuthoring` — the variant-axis authoring model
 * (PLAN-0020 CORE-P2-009H; ED-VARIANT-001; DD-0019 §14.2, §14.4).
 *
 * Axes and their options are part of the *definition*, so every
 * mutation here is a `component.definition.update` and therefore
 * requires the component's own isolated scope (freeze §6). The hook
 * is only usable while that scope is active — the panel that renders
 * it lives inside the isolated canvas, so this is a structural fact,
 * not a check the UI can forget.
 *
 * ### Which caps are enforced where
 *
 * The engine's `validateVariantModel` is the authority on the two
 * frozen caps: ≤`variantAxesPerComponent` (3) axes and
 * ≤`variantsPerComponent` (20) *declared* variants. This hook
 * additionally refuses an edit that would push the number of
 * **expressible** combinations (the product of every axis's option
 * count) past 20 — a model with 3 axes × 5 options declares only 0
 * variants but offers 125 combinations, which is unusable as a strip
 * and cannot ever be fully declared under the 20-variant cap. That
 * check lives here rather than in the reducer deliberately: adding a
 * new hard rejection to a frozen contract would change the meaning of
 * already-valid documents, whereas refusing to *author* one is a UI
 * policy that leaves existing data readable.
 *
 * Errors are returned, never thrown, and never silently swallowed:
 * the panel renders them.
 */

import type {
	ComponentDefinition,
	EditorError,
	VariantAxis,
} from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import { use, useCallback, useMemo, useSyncExternalStore } from "react";
import type { InternalEditorCommandPort } from "../command-port.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import { scopedDefinitionId } from "./scope.js";

/** The maximum expressible combinations an authored model may offer. */
export const MAX_EXPRESSIBLE_COMBINATIONS =
	EDITOR_COUNT_LIMITS.variantsPerComponent;

/** Outcome of one axis-model edit. */
export interface VariantEditOutcome {
	readonly status: "committed" | "rejected";
	readonly errors: readonly EditorError[];
}

/** Variant-axis authoring for the component currently in scope. */
export interface VariantAuthoring {
	readonly definition: ComponentDefinition;
	readonly axes: readonly VariantAxis[];
	/** Product of every axis's option count; `0` with no axes. */
	readonly expressibleCombinations: number;
	readonly maxAxes: number;
	readonly maxCombinations: number;
	/** True when another axis may be added right now. */
	readonly canAddAxis: boolean;
	readonly addAxis: (name: string) => Promise<VariantEditOutcome>;
	readonly renameAxis: (
		axisId: string,
		name: string,
	) => Promise<VariantEditOutcome>;
	readonly removeAxis: (axisId: string) => Promise<VariantEditOutcome>;
	readonly addOption: (
		axisId: string,
		name: string,
	) => Promise<VariantEditOutcome>;
	readonly renameOption: (
		axisId: string,
		optionId: string,
		name: string,
	) => Promise<VariantEditOutcome>;
	readonly removeOption: (
		axisId: string,
		optionId: string,
	) => Promise<VariantEditOutcome>;
}

function combinationsOf(axes: readonly VariantAxis[]): number {
	if (axes.length === 0) return 0;
	return axes.reduce(
		(total, axis) => total * Math.max(axis.options.length, 1),
		1,
	);
}

/**
 * Report declared variants that an axis or option removal destroyed.
 *
 * Collapsing selections that are no longer distinct is *required* —
 * `validateVariantModel` rejects an ambiguous model, so leaving them
 * would make the removal read to the user as "remove failed". But the
 * variants that collapse take their per-variant node overrides and
 * content with them. §14.2 permits the loss; it does not permit the
 * loss to be silent, and this file's own contract is that errors are
 * "never silently swallowed".
 *
 * `warning`, not `error`: the edit committed, and this describes what
 * it cost rather than a reason to undo it.
 */
function variantsDroppedWarning(
	definitionId: string,
	dropped: number,
): EditorError | null {
	if (dropped <= 0) return null;
	return {
		code: "EDITOR_COMMAND_CONFLICT",
		severity: "warning",
		message:
			dropped === 1
				? "1 declared variant was removed — it no longer addresses a distinct combination"
				: `${dropped} declared variants were removed — they no longer address distinct combinations`,
		recoverable: true,
		details: {
			kind: "variantOverride",
			definitionId,
			reason: "variants-dropped",
			dropped,
		},
	};
}

/** Append a non-null warning to a committed result's error list. */
function withWarning(
	errors: readonly EditorError[],
	warning: EditorError | null,
): readonly EditorError[] {
	return warning === null ? errors : [...errors, warning];
}

function limitError(
	message: string,
	details: Readonly<Record<string, unknown>>,
): EditorError {
	return {
		code: "EDITOR_LIMIT_EXCEEDED",
		severity: "error",
		message,
		recoverable: true,
		details,
	};
}

/**
 * A rejected authoring edit. `EDITOR_COMMAND_CONFLICT` is the frozen
 * code for "this command is not valid against the current model" —
 * there is no separate validation code in the §9.5 envelope.
 */
function validationError(
	message: string,
	details: Readonly<Record<string, unknown>>,
): EditorError {
	return {
		code: "EDITOR_COMMAND_CONFLICT",
		severity: "error",
		message,
		recoverable: true,
		details,
	};
}

/**
 * Variant authoring for the definition in the active isolated scope,
 * or `null` outside one (or while writers are unavailable).
 */
export function useVariantAuthoring(): VariantAuthoring | null {
	const bridge = use(StudioEditorBridgeContext);
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);
	const port = bridge?.port as InternalEditorCommandPort | null | undefined;

	const definition = useMemo((): ComponentDefinition | null => {
		void version;
		if (port == null) return null;
		const snapshot = port.getSnapshot();
		const definitionId = scopedDefinitionId(snapshot.selection.scope);
		if (definitionId === undefined) return null;
		return snapshot.authoring.componentDefinitions[definitionId] ?? null;
	}, [port, version]);

	/**
	 * Commit a whole replacement axis list. Axis edits are always
	 * expressed as a full-list patch rather than a positional one: the
	 * list is short, and a whole-list write is the only shape that
	 * cannot desynchronize under concurrent edits.
	 */
	const commitAxes = useCallback(
		async (
			next: readonly VariantAxis[],
			extraErrors: readonly EditorError[] = [],
		): Promise<VariantEditOutcome> => {
			if (port == null || definition === null) {
				return { status: "rejected", errors: extraErrors };
			}
			if (extraErrors.length > 0) {
				return { status: "rejected", errors: extraErrors };
			}
			const result = await port.execute({
				id: crypto.randomUUID(),
				expectedRevision: port.getSnapshot().revision,
				source: "inspector",
				timestamp: Date.now(),
				type: "component.definition.update",
				definitionId: definition.id,
				patch: { variantAxes: next } as never,
			});
			return {
				status: result.status === "committed" ? "committed" : "rejected",
				errors: result.errors,
			};
		},
		[port, definition],
	);

	const addAxis = useCallback(
		async (name: string): Promise<VariantEditOutcome> => {
			if (definition === null) return { status: "rejected", errors: [] };
			const trimmed = name.trim();
			if (trimmed.length === 0) {
				return {
					status: "rejected",
					errors: [
						validationError("a variant axis needs a name", {
							kind: "variantAxis",
							reason: "empty-name",
						}),
					],
				};
			}
			if (
				definition.variantAxes.length >=
				EDITOR_COUNT_LIMITS.variantAxesPerComponent
			) {
				return {
					status: "rejected",
					errors: [
						limitError(
							`components allow at most ${EDITOR_COUNT_LIMITS.variantAxesPerComponent} variant axes`,
							{
								limitKey: "variantAxesPerComponent",
								limit: EDITOR_COUNT_LIMITS.variantAxesPerComponent,
								actual: definition.variantAxes.length + 1,
								definitionId: definition.id,
							},
						),
					],
				};
			}
			// A new axis starts with one option so the model stays
			// expressible: an axis with zero options would make the
			// combination product collapse to nothing.
			const axis: VariantAxis = {
				id: crypto.randomUUID(),
				name: trimmed,
				options: [{ id: crypto.randomUUID(), name: "Default" }],
			};
			return commitAxes([...definition.variantAxes, axis]);
		},
		[definition, commitAxes],
	);

	const renameAxis = useCallback(
		async (axisId: string, name: string): Promise<VariantEditOutcome> => {
			if (definition === null) return { status: "rejected", errors: [] };
			const trimmed = name.trim();
			if (trimmed.length === 0) {
				return {
					status: "rejected",
					errors: [
						validationError("a variant axis needs a name", {
							kind: "variantAxis",
							axisId,
							reason: "empty-name",
						}),
					],
				};
			}
			return commitAxes(
				definition.variantAxes.map((axis) =>
					axis.id === axisId ? { ...axis, name: trimmed } : axis,
				),
			);
		},
		[definition, commitAxes],
	);

	const removeAxis = useCallback(
		async (axisId: string): Promise<VariantEditOutcome> => {
			if (definition === null) return { status: "rejected", errors: [] };
			const nextAxes = definition.variantAxes.filter(
				(axis) => axis.id !== axisId,
			);
			// Every declared variant selects every axis (§14.2). Dropping
			// an axis must therefore drop that axis from each variant's
			// selection, and collapse variants that become duplicates —
			// otherwise `validateVariantModel` rejects the whole edit for
			// ambiguity, which would read to the user as "remove failed".
			if (port == null) return { status: "rejected", errors: [] };
			const seen = new Set<string>();
			const nextVariants = definition.variants
				.map((variant) => {
					const selection = { ...variant.selection };
					delete selection[axisId];
					return { ...variant, selection };
				})
				.filter((variant) => {
					const key = Object.keys(variant.selection)
						.sort()
						.map((id) => `${id}=${variant.selection[id]}`)
						.join("&");
					if (seen.has(key)) return false;
					seen.add(key);
					return true;
				});
			const result = await port.execute({
				id: crypto.randomUUID(),
				expectedRevision: port.getSnapshot().revision,
				source: "inspector",
				timestamp: Date.now(),
				type: "component.definition.update",
				definitionId: definition.id,
				// Axes and variants change together, in ONE dispatch: an
				// intermediate state with a stale variant selection is not
				// a valid model and must never be committed.
				patch: {
					variantAxes: nextAxes,
					variants: nextAxes.length === 0 ? [] : nextVariants,
				} as never,
			});
			const committed = result.status === "committed";
			return {
				status: committed ? "committed" : "rejected",
				errors: committed
					? withWarning(
							result.errors,
							variantsDroppedWarning(
								definition.id,
								definition.variants.length -
									(nextAxes.length === 0 ? 0 : nextVariants.length),
							),
						)
					: result.errors,
			};
		},
		[definition, port],
	);

	const addOption = useCallback(
		async (axisId: string, name: string): Promise<VariantEditOutcome> => {
			if (definition === null) return { status: "rejected", errors: [] };
			const trimmed = name.trim();
			if (trimmed.length === 0) {
				return {
					status: "rejected",
					errors: [
						validationError("a variant option needs a name", {
							kind: "variantOption",
							axisId,
							reason: "empty-name",
						}),
					],
				};
			}
			const nextAxes = definition.variantAxes.map((axis) =>
				axis.id === axisId
					? {
							...axis,
							options: [
								...axis.options,
								{ id: crypto.randomUUID(), name: trimmed },
							],
						}
					: axis,
			);
			const projected = combinationsOf(nextAxes);
			if (projected > MAX_EXPRESSIBLE_COMBINATIONS) {
				return {
					status: "rejected",
					errors: [
						limitError(
							`this option would make ${projected} variant combinations expressible; the limit is ${MAX_EXPRESSIBLE_COMBINATIONS}`,
							{
								limitKey: "variantsPerComponent",
								limit: MAX_EXPRESSIBLE_COMBINATIONS,
								actual: projected,
								definitionId: definition.id,
								axisId,
							},
						),
					],
				};
			}
			return commitAxes(nextAxes);
		},
		[definition, commitAxes],
	);

	const renameOption = useCallback(
		async (
			axisId: string,
			optionId: string,
			name: string,
		): Promise<VariantEditOutcome> => {
			if (definition === null) return { status: "rejected", errors: [] };
			const trimmed = name.trim();
			if (trimmed.length === 0) {
				return {
					status: "rejected",
					errors: [
						validationError("a variant option needs a name", {
							kind: "variantOption",
							axisId,
							optionId,
							reason: "empty-name",
						}),
					],
				};
			}
			return commitAxes(
				definition.variantAxes.map((axis) =>
					axis.id === axisId
						? {
								...axis,
								options: axis.options.map((option) =>
									option.id === optionId
										? { ...option, name: trimmed }
										: option,
								),
							}
						: axis,
				),
			);
		},
		[definition, commitAxes],
	);

	const removeOption = useCallback(
		async (axisId: string, optionId: string): Promise<VariantEditOutcome> => {
			if (definition === null || port == null) {
				return { status: "rejected", errors: [] };
			}
			const axis = definition.variantAxes.find((entry) => entry.id === axisId);
			if (axis === undefined) return { status: "rejected", errors: [] };
			if (axis.options.length <= 1) {
				return {
					status: "rejected",
					errors: [
						validationError(
							"an axis must keep at least one option — remove the axis instead",
							{
								kind: "variantOption",
								axisId,
								optionId,
								reason: "last-option",
							},
						),
					],
				};
			}
			const nextAxes = definition.variantAxes.map((entry) =>
				entry.id === axisId
					? {
							...entry,
							options: entry.options.filter((option) => option.id !== optionId),
						}
					: entry,
			);
			// Variants selecting the removed option no longer address a
			// valid combination; drop them in the same dispatch.
			const nextVariants = definition.variants.filter(
				(variant) => variant.selection[axisId] !== optionId,
			);
			const result = await port.execute({
				id: crypto.randomUUID(),
				expectedRevision: port.getSnapshot().revision,
				source: "inspector",
				timestamp: Date.now(),
				type: "component.definition.update",
				definitionId: definition.id,
				patch: { variantAxes: nextAxes, variants: nextVariants } as never,
			});
			const committed = result.status === "committed";
			return {
				status: committed ? "committed" : "rejected",
				errors: committed
					? withWarning(
							result.errors,
							variantsDroppedWarning(
								definition.id,
								definition.variants.length - nextVariants.length,
							),
						)
					: result.errors,
			};
		},
		[definition, port],
	);

	return useMemo(() => {
		if (definition === null || port == null) return null;
		if (port.isReadOnly() || port.writersDisabled()) return null;
		return {
			definition,
			axes: definition.variantAxes,
			expressibleCombinations: combinationsOf(definition.variantAxes),
			maxAxes: EDITOR_COUNT_LIMITS.variantAxesPerComponent,
			maxCombinations: MAX_EXPRESSIBLE_COMBINATIONS,
			canAddAxis:
				definition.variantAxes.length <
				EDITOR_COUNT_LIMITS.variantAxesPerComponent,
			addAxis,
			renameAxis,
			removeAxis,
			addOption,
			renameOption,
			removeOption,
		};
	}, [
		definition,
		port,
		addAxis,
		renameAxis,
		removeAxis,
		addOption,
		renameOption,
		removeOption,
	]);
}

function noopSubscribe(): () => void {
	return noop;
}
function noop(): void {
	// The no-bridge store never changes.
}
function zero(): number {
	return 0;
}
