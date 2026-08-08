"use client";

/**
 * @file `useVariantAuthoring` — the variant-axis authoring model
 * (PLAN-0028 `p5-006`; ED-VARIANT-001; DD-0019 §14.2, §14.4).
 *
 * Axes and their options are part of the *definition*, so every edit
 * here lands in the declared root prop `root.props.componentLibrary`
 * (contract rule 2) and the hook is only live while a definition is
 * open in isolated editing (freeze §6). The Components panel is the
 * one surface that opens a definition, so "which component am I
 * authoring axes for" has exactly one answer.
 *
 * ### What `p5-006` changed
 *
 * The definition used to be read from
 * `port.getSnapshot().authoring.componentDefinitions` — the sidecar,
 * which carrier documents never populate — and every edit was a
 * whole-list `component.definition.update` through the command engine.
 * Reads are now `p2-004`'s projection and writes are `p3-002`'s
 * {@link commitVariantModelUpdate}, one granular `VariantModelEdit`
 * per user intent, each exactly one history-recording `setData`.
 *
 * The whole-list patch is gone deliberately: it could not express
 * "delete this axis **and** re-resolve every instance that selected
 * it" in one `Data`, so the instance half used to be a second, separate
 * concern. The commit path does both, which is why deleting an axis is
 * one undo rather than one-plus-N.
 *
 * ### Which caps are enforced where
 *
 * `validateVariantModel` is the authority on the two frozen caps:
 * ≤`variantAxesPerComponent` (3) axes and ≤`variantsPerComponent` (20)
 * *declared* variants. The commit path additionally refuses an edit
 * that would push the number of **expressible** combinations (the
 * product of every axis's option count) past
 * {@link MAX_EXPRESSIBLE_COMBINATIONS} — a model with 3 axes × 5
 * options declares 0 variants but offers 125 combinations, which is
 * unusable as a strip and can never be fully declared under the
 * 20-variant cap.
 *
 * This hook's job is to surface both caps **before** they are hit:
 * {@link VariantAuthoring.canAddAxis} and
 * {@link VariantAuthoring.canAddOption} are false at the boundary, so
 * the affordance disables rather than the submit failing. The
 * write-time rejection stays as the backstop — a disabled button is
 * UX, not enforcement.
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
import { useCallback, useMemo } from "react";
import type { VariantModelEdit } from "../../../puck/update-variants.js";
import {
	commitVariantModelUpdate,
	MAX_EXPRESSIBLE_COMBINATIONS,
} from "../../../puck/update-variants.js";
import { useShellSelection } from "../composition/use-shell-selection.js";
import { useOptionalDocumentModel } from "../use-document-model.js";
import {
	useComponentEditorRuntime,
	usePuckApiGetter,
} from "./editor-runtime.js";
import { scopedDefinitionId } from "./scope.js";

export { MAX_EXPRESSIBLE_COMBINATIONS };

/** Outcome of one axis-model edit. */
export interface VariantEditOutcome {
	readonly status: "committed" | "noop" | "rejected";
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
	/**
	 * True when another option may be added to `axisId` right now —
	 * i.e. the resulting combination product still fits under
	 * {@link MAX_EXPRESSIBLE_COMBINATIONS}. The cap is per-axis because
	 * the product is: a third option on a 2×2 model is fine, a third on
	 * a 4×5 model is not.
	 */
	readonly canAddOption: (axisId: string) => boolean;
	readonly addAxis: (name: string) => VariantEditOutcome;
	readonly renameAxis: (axisId: string, name: string) => VariantEditOutcome;
	readonly removeAxis: (axisId: string) => VariantEditOutcome;
	readonly addOption: (axisId: string, name: string) => VariantEditOutcome;
	readonly renameOption: (
		axisId: string,
		optionId: string,
		name: string,
	) => VariantEditOutcome;
	readonly removeOption: (
		axisId: string,
		optionId: string,
	) => VariantEditOutcome;
}

function combinationsOf(axes: readonly VariantAxis[]): number {
	if (axes.length === 0) return 0;
	return axes.reduce(
		(total, axis) => total * Math.max(axis.options.length, 1),
		1,
	);
}

/**
 * A rejected authoring edit. `EDITOR_COMMAND_CONFLICT` is the frozen
 * code for "this command is not valid against the current model" —
 * there is no separate validation code in the §9.5 envelope.
 */
function validationError(
	message: string,
	details: Readonly<Record<string, unknown>>,
): VariantEditOutcome {
	return {
		status: "rejected",
		errors: [
			{
				code: "EDITOR_COMMAND_CONFLICT",
				severity: "error",
				message,
				recoverable: true,
				details,
			},
		],
	};
}

const NOT_AUTHORABLE: VariantEditOutcome = Object.freeze({
	status: "rejected",
	errors: Object.freeze([]),
});

/**
 * Variant authoring for the definition in the active isolated scope,
 * or `null` outside one (or while writers are unavailable).
 *
 * Degrades to `null` outside `<Puck>` rather than throwing — the form
 * is mounted by chrome that production always renders inside the
 * provider, but tests and hosts may not.
 */
export function useVariantAuthoring(): VariantAuthoring | null {
	const model = useOptionalDocumentModel();
	const selection = useShellSelection();
	const runtime = useComponentEditorRuntime();
	const getPuckApi = usePuckApiGetter();

	const definition = useMemo((): ComponentDefinition | null => {
		const definitionId = scopedDefinitionId(selection.definitionScope);
		if (definitionId === undefined || model === null) return null;
		return model.componentLibrary?.definitions[definitionId] ?? null;
	}, [model, selection.definitionScope]);

	const commit = useCallback(
		(edit: VariantModelEdit): VariantEditOutcome => {
			const api = getPuckApi();
			if (definition === null || api === null) return NOT_AUTHORABLE;
			const result = commitVariantModelUpdate(
				{ getPuckApi: () => api },
				definition.id,
				edit,
			);
			return { status: result.status, errors: result.errors };
		},
		[definition, getPuckApi],
	);

	const addAxis = useCallback(
		(name: string): VariantEditOutcome => {
			const trimmed = name.trim();
			if (trimmed.length === 0) {
				return validationError("a variant axis needs a name", {
					kind: "variantAxis",
					reason: "empty-name",
				});
			}
			return commit({
				kind: "add-axis",
				axis: {
					id: crypto.randomUUID(),
					name: trimmed,
					// A new axis starts with one option so the model stays
					// expressible: an axis with zero options would collapse the
					// combination product to nothing.
					options: [{ id: crypto.randomUUID(), name: "Default" }],
				},
			});
		},
		[commit],
	);

	const renameAxis = useCallback(
		(axisId: string, name: string): VariantEditOutcome => {
			const trimmed = name.trim();
			if (trimmed.length === 0) {
				return validationError("a variant axis needs a name", {
					kind: "variantAxis",
					axisId,
					reason: "empty-name",
				});
			}
			return commit({ kind: "rename-axis", axisId, name: trimmed });
		},
		[commit],
	);

	const removeAxis = useCallback(
		(axisId: string): VariantEditOutcome =>
			commit({ kind: "delete-axis", axisId }),
		[commit],
	);

	const addOption = useCallback(
		(axisId: string, name: string): VariantEditOutcome => {
			const trimmed = name.trim();
			if (trimmed.length === 0) {
				return validationError("a variant option needs a name", {
					kind: "variantOption",
					axisId,
					reason: "empty-name",
				});
			}
			return commit({
				kind: "add-option",
				axisId,
				option: { id: crypto.randomUUID(), name: trimmed },
			});
		},
		[commit],
	);

	const renameOption = useCallback(
		(axisId: string, optionId: string, name: string): VariantEditOutcome => {
			const trimmed = name.trim();
			if (trimmed.length === 0) {
				return validationError("a variant option needs a name", {
					kind: "variantOption",
					axisId,
					optionId,
					reason: "empty-name",
				});
			}
			return commit({
				kind: "rename-option",
				axisId,
				optionId,
				name: trimmed,
			});
		},
		[commit],
	);

	const removeOption = useCallback(
		(axisId: string, optionId: string): VariantEditOutcome => {
			const axis = definition?.variantAxes.find((entry) => entry.id === axisId);
			if (axis === undefined) return NOT_AUTHORABLE;
			if (axis.options.length <= 1) {
				return validationError(
					"an axis must keep at least one option — remove the axis instead",
					{
						kind: "variantOption",
						axisId,
						optionId,
						reason: "last-option",
					},
				);
			}
			return commit({ kind: "delete-option", axisId, optionId });
		},
		[commit, definition],
	);

	const canAddOption = useCallback(
		(axisId: string): boolean => {
			if (definition === null) return false;
			const projected = combinationsOf(
				definition.variantAxes.map((axis) =>
					axis.id === axisId
						? {
								...axis,
								options: [...axis.options, { id: "", name: "" }],
							}
						: axis,
				),
			);
			return projected <= MAX_EXPRESSIBLE_COMBINATIONS;
		},
		[definition],
	);

	return useMemo(() => {
		if (definition === null || !runtime.canMutate) return null;
		return {
			definition,
			axes: definition.variantAxes,
			expressibleCombinations: combinationsOf(definition.variantAxes),
			maxAxes: EDITOR_COUNT_LIMITS.variantAxesPerComponent,
			maxCombinations: MAX_EXPRESSIBLE_COMBINATIONS,
			canAddAxis:
				definition.variantAxes.length <
				EDITOR_COUNT_LIMITS.variantAxesPerComponent,
			canAddOption,
			addAxis,
			renameAxis,
			removeAxis,
			addOption,
			renameOption,
			removeOption,
		};
	}, [
		definition,
		runtime.canMutate,
		canAddOption,
		addAxis,
		renameAxis,
		removeAxis,
		addOption,
		renameOption,
		removeOption,
	]);
}
