/**
 * @file Variant axis/option/patch edits and instance variant selection
 * (PLAN-0026 §3.4, §3.8.1; DD-0019 `ED-FA-002`, §14.4). Pure and
 * React-free.
 *
 * ## The split that matters (contract rule 2)
 *
 * - The variant **model** — axes, options, per-variant patches — is
 *   part of the definition, so it lives in the declared root prop
 *   `root.props.componentLibrary`.
 * - The variant **selection** is per-instance render state, so it lives
 *   in that node's declared instance prop. It is never written into the
 *   definition.
 *
 * Nothing here writes a *resolved* variant. Resolution is recomputed by
 * `p2-004`'s projection on every read (contract rule 5).
 *
 * ## §14.4 precedence — the same order the read side implements
 *
 *   1. definition base
 *   2. variant patch          ← written here
 *   3. exposed property override
 *   4. instance node override
 *   5. breakpoint override
 *
 * Stated here and in `document-model/component-library.ts` verbatim, as
 * the acceptance criterion requires, because a write path that believes
 * a different order than the read path is precisely how a variant patch
 * silently loses to something it should beat.
 *
 * ## One intent, one history entry
 *
 * Deleting an axis both edits the definition **and** resolves every
 * instance selection that referenced it. Both land in ONE `Data` and
 * therefore ONE `setData` — adding an option is one undo step, not one
 * per instance that re-resolves as a consequence.
 */

import type {
	ComponentDefinition,
	ComponentVariant,
	EditorError,
	NodeOverridePatch,
	VariantAxis,
	VariantAxisOption,
} from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import type { Config, Data, PuckApi } from "@puckeditor/core";
import { walkTree } from "@puckeditor/core";
import {
	readComponentInstanceProp,
	validateVariantModel,
	writeComponentInstanceProp,
	variantCombinationCount,
	variantCombinationKey,
} from "../document-model/materialize.js";
import { makeEditorError } from "../editor/diagnostics.js";
import { deepEqualJson } from "../editor/patch.js";
import { parseComponentLibrary } from "./read-appearance.js";
import { withComponentLibrary } from "./update-component-library.js";

/**
 * The maximum expressible combinations an authored model may offer.
 *
 * Carried across from `react/editor/components/use-variant-authoring.ts`
 * by `p3-002` and enforced **in the commit path**, not only in the old
 * UI hook — it is a real product cap, so a write that would exceed it is
 * rejected with a diagnostic rather than silently truncated.
 */
export const MAX_EXPRESSIBLE_COMBINATIONS =
	EDITOR_COUNT_LIMITS.variantsPerComponent;

/** One edit to a definition's variant model. */
export type VariantModelEdit =
	| { readonly kind: "add-axis"; readonly axis: VariantAxis }
	| {
			readonly kind: "rename-axis";
			readonly axisId: string;
			readonly name: string;
	  }
	| { readonly kind: "reorder-axes"; readonly axisIds: readonly string[] }
	| { readonly kind: "delete-axis"; readonly axisId: string }
	| {
			readonly kind: "add-option";
			readonly axisId: string;
			readonly option: VariantAxisOption;
	  }
	| {
			readonly kind: "rename-option";
			readonly axisId: string;
			readonly optionId: string;
			readonly name: string;
	  }
	| {
			readonly kind: "reorder-options";
			readonly axisId: string;
			readonly optionIds: readonly string[];
	  }
	| {
			readonly kind: "delete-option";
			readonly axisId: string;
			readonly optionId: string;
	  }
	| {
			readonly kind: "set-variant-patch";
			readonly selection: Readonly<Record<string, string>>;
			readonly patch: Readonly<Record<string, NodeOverridePatch>>;
	  };

/** Input to {@link updateVariantModelInData}. */
export interface UpdateVariantModelInput {
	readonly data: Data;
	readonly config: Config;
	readonly definitionId: string;
	readonly edit: VariantModelEdit;
}

/** Outcome of a variant write. */
export interface UpdateVariantResult {
	readonly data: Data;
	readonly status: "updated" | "noop" | "rejected";
	/** Instance node ids whose selection was resolved as a consequence. */
	readonly resolvedNodeIds: readonly string[];
	readonly errors: readonly EditorError[];
}

const NO_IDS: readonly string[] = Object.freeze([]);

function reorder<T extends { readonly id: string }>(
	items: readonly T[],
	order: readonly string[],
): readonly T[] {
	const byId = new Map(items.map((item) => [item.id, item]));
	const next: T[] = [];
	for (const id of order) {
		const item = byId.get(id);
		if (item !== undefined) {
			next.push(item);
			byId.delete(id);
		}
	}
	// Anything the caller did not mention keeps its relative order at the
	// end, so a partial order can never silently drop an axis or option.
	for (const item of items) if (byId.has(item.id)) next.push(item);
	return next;
}

/** Apply one model edit to a definition. Pure; no validation here. */
function applyEdit(
	definition: ComponentDefinition,
	edit: VariantModelEdit,
): ComponentDefinition {
	const axes = definition.variantAxes;
	switch (edit.kind) {
		case "add-axis":
			return { ...definition, variantAxes: [...axes, edit.axis] };
		case "rename-axis":
			return {
				...definition,
				variantAxes: axes.map((axis) =>
					axis.id === edit.axisId ? { ...axis, name: edit.name } : axis,
				),
			};
		case "reorder-axes":
			return { ...definition, variantAxes: reorder(axes, edit.axisIds) };
		case "delete-axis":
			return {
				...definition,
				variantAxes: axes.filter((axis) => axis.id !== edit.axisId),
				// A variant's selection is keyed by axis; dropping the axis
				// drops that key from every variant so no variant keeps a
				// dangling reference.
				variants: definition.variants.map((variant) => {
					const { [edit.axisId]: _gone, ...selection } = variant.selection;
					return { ...variant, selection };
				}),
			};
		case "add-option":
			return {
				...definition,
				variantAxes: axes.map((axis) =>
					axis.id === edit.axisId
						? { ...axis, options: [...axis.options, edit.option] }
						: axis,
				),
			};
		case "rename-option":
			return {
				...definition,
				variantAxes: axes.map((axis) =>
					axis.id === edit.axisId
						? {
								...axis,
								options: axis.options.map((option) =>
									option.id === edit.optionId
										? { ...option, name: edit.name }
										: option,
								),
							}
						: axis,
				),
			};
		case "reorder-options":
			return {
				...definition,
				variantAxes: axes.map((axis) =>
					axis.id === edit.axisId
						? { ...axis, options: reorder(axis.options, edit.optionIds) }
						: axis,
				),
			};
		case "delete-option":
			return {
				...definition,
				variantAxes: axes.map((axis) =>
					axis.id === edit.axisId
						? {
								...axis,
								options: axis.options.filter(
									(option) => option.id !== edit.optionId,
								),
							}
						: axis,
				),
				// Any variant pinned to the removed option can no longer be
				// selected, so it goes with it rather than becoming dead data.
				variants: definition.variants.filter(
					(variant) => variant.selection[edit.axisId] !== edit.optionId,
				),
			};
		case "set-variant-patch": {
			const key = variantCombinationKey(edit.selection);
			const existing = definition.variants.find(
				(variant) => variantCombinationKey(variant.selection) === key,
			);
			const next: ComponentVariant = {
				id: existing?.id ?? `variant:${key}`,
				...(existing?.name !== undefined ? { name: existing.name } : {}),
				selection: edit.selection,
				patch: edit.patch,
			};
			return {
				...definition,
				variants:
					existing === undefined
						? [...definition.variants, next]
						: definition.variants.map((variant) =>
								variant === existing ? next : variant,
							),
			};
		}
	}
}

/** The axis→option pairs an edit invalidates on live instances. */
function invalidatedSelection(
	edit: VariantModelEdit,
): { readonly axisId: string; readonly optionId?: string } | undefined {
	if (edit.kind === "delete-axis") return { axisId: edit.axisId };
	if (edit.kind === "delete-option") {
		return { axisId: edit.axisId, optionId: edit.optionId };
	}
	return undefined;
}

/**
 * Rewrite instance selections that reference something the edit
 * removed, so no instance is left holding a dangling axis or option.
 *
 * Same rule `p3-007` applies to dangling `targetId`s: the reference is
 * resolved at the moment it stops being resolvable, in the same commit,
 * rather than surviving as data that reads as valid and renders as
 * nothing.
 */
function resolveInstanceSelections(
	data: Data,
	config: Config,
	definitionId: string,
	invalid: { readonly axisId: string; readonly optionId?: string },
): { readonly data: Data; readonly resolvedNodeIds: readonly string[] } {
	const resolvedNodeIds: string[] = [];
	const next = walkTree(data, config, (content) =>
		content.map((item) => {
			const props = item.props as Record<string, unknown>;
			const nodeId = typeof props.id === "string" ? props.id : undefined;
			if (nodeId === undefined) return item;
			const raw = readComponentInstanceProp(props) as
				| { definitionId?: unknown; variantSelection?: unknown }
				| undefined;
			if (
				typeof raw !== "object" ||
				raw === null ||
				raw.definitionId !== definitionId
			) {
				return item;
			}
			const selection = raw.variantSelection as
				| Record<string, string>
				| undefined;
			if (selection === undefined || !(invalid.axisId in selection)) {
				return item;
			}
			if (
				invalid.optionId !== undefined &&
				selection[invalid.axisId] !== invalid.optionId
			) {
				return item;
			}
			const { [invalid.axisId]: _gone, ...rest } = selection;
			resolvedNodeIds.push(nodeId);
			return {
				...item,
				props: writeComponentInstanceProp(props, {
					...raw,
					variantSelection: rest,
				}) as typeof item.props,
			};
		}),
	);
	return { data: next, resolvedNodeIds };
}

/**
 * Edit a definition's variant model, resolving any instance selection
 * the edit invalidates — in one `Data`, therefore one history entry.
 */
export function updateVariantModelInData(
	input: UpdateVariantModelInput,
): UpdateVariantResult {
	const errors: EditorError[] = [];
	const reject = (): UpdateVariantResult => ({
		data: input.data,
		status: "rejected",
		resolvedNodeIds: NO_IDS,
		errors,
	});

	const raw = (input.data.root?.props as { componentLibrary?: unknown })
		?.componentLibrary;
	const library = raw === undefined ? undefined : parseComponentLibrary(raw);
	if (raw !== undefined && library === undefined) {
		errors.push(
			makeEditorError(
				"EDITOR_CONTRACT_UNSUPPORTED_VERSION",
				"root.props.componentLibrary fails validation; refusing to overwrite it",
			),
		);
		return reject();
	}
	const current = library?.definitions[input.definitionId];
	if (current === undefined) {
		errors.push(
			makeEditorError(
				"EDITOR_DEFINITION_UNAVAILABLE",
				`component definition "${input.definitionId}" is not in this document`,
				{
					details: {
						kind: "componentDefinition",
						definitionId: input.definitionId,
					},
				},
			),
		);
		return reject();
	}

	const nextDefinition = applyEdit(current, input.edit);

	// The product cap, enforced at write time with a diagnostic — never a
	// silent truncation.
	const combinations = variantCombinationCount(nextDefinition.variantAxes);
	if (combinations > MAX_EXPRESSIBLE_COMBINATIONS) {
		errors.push(
			makeEditorError(
				"EDITOR_LIMIT_EXCEEDED",
				`this edit would make ${combinations} variant combinations expressible; the limit is ${MAX_EXPRESSIBLE_COMBINATIONS}`,
				{
					details: {
						kind: "variantAxis",
						definitionId: input.definitionId,
						limit: MAX_EXPRESSIBLE_COMBINATIONS,
						actual: combinations,
					},
				},
			),
		);
		return reject();
	}

	const modelErrors = validateVariantModel(nextDefinition);
	if (modelErrors.length > 0) {
		errors.push(...modelErrors);
		return reject();
	}

	const nextLibrary = {
		definitions: {
			...library?.definitions,
			[input.definitionId]: nextDefinition,
		},
	};
	if (parseComponentLibrary(nextLibrary) === undefined) {
		errors.push(
			makeEditorError(
				"EDITOR_INVALID_CSS_VALUE",
				"the updated component library fails schema validation",
				{ details: { kind: "componentDefinition" } },
			),
		);
		return reject();
	}

	let nextData = withComponentLibrary(input.data, nextLibrary);
	let resolvedNodeIds: readonly string[] = NO_IDS;
	const invalid = invalidatedSelection(input.edit);
	if (invalid !== undefined) {
		const resolved = resolveInstanceSelections(
			nextData,
			input.config,
			input.definitionId,
			invalid,
		);
		nextData = resolved.data;
		resolvedNodeIds = resolved.resolvedNodeIds;
	}

	if (deepEqualJson(input.data, nextData)) {
		return {
			data: input.data,
			status: "noop",
			resolvedNodeIds: NO_IDS,
			errors: [],
		};
	}
	return { data: nextData, status: "updated", resolvedNodeIds, errors: [] };
}

/** Input to {@link updateInstanceSelectionInData}. */
export interface UpdateInstanceSelectionInput {
	readonly data: Data;
	readonly config: Config;
	/** Plural: the same selection may be applied across a multi-select. */
	readonly nodeIds: readonly string[];
	readonly selection: Readonly<Record<string, string>>;
}

/**
 * Set the variant selection on one or more instances.
 *
 * Writes the instance's **declared node prop** — never the definition.
 * An option that the definition does not declare is rejected before
 * anything writes, so an instance cannot come to hold a selection the
 * model cannot express.
 */
export function updateInstanceSelectionInData(
	input: UpdateInstanceSelectionInput,
): UpdateVariantResult {
	const errors: EditorError[] = [];
	const raw = (input.data.root?.props as { componentLibrary?: unknown })
		?.componentLibrary;
	const library = raw === undefined ? undefined : parseComponentLibrary(raw);
	const changed = new Set(input.nodeIds);
	const resolvedNodeIds: string[] = [];

	const nextData = walkTree(input.data, input.config, (content) =>
		content.map((item) => {
			const props = item.props as Record<string, unknown>;
			const nodeId = typeof props.id === "string" ? props.id : undefined;
			if (nodeId === undefined || !changed.has(nodeId)) return item;
			const instance = readComponentInstanceProp(props) as
				| { definitionId?: unknown }
				| undefined;
			if (
				typeof instance !== "object" ||
				instance === null ||
				typeof instance.definitionId !== "string"
			) {
				return item;
			}
			const definition = library?.definitions[instance.definitionId];
			if (definition === undefined) {
				errors.push(
					makeEditorError(
						"EDITOR_DEFINITION_UNAVAILABLE",
						`component definition "${instance.definitionId}" is not in this document`,
						{ nodeIds: [nodeId] },
					),
				);
				return item;
			}
			for (const [axisId, optionId] of Object.entries(input.selection)) {
				const axis = definition.variantAxes.find(
					(entry) => entry.id === axisId,
				);
				if (axis === undefined) {
					errors.push(
						makeEditorError(
							"EDITOR_NODE_NOT_FOUND",
							`variant axis "${axisId}" is not declared by "${instance.definitionId}"`,
							{ nodeIds: [nodeId], details: { kind: "variantAxis", axisId } },
						),
					);
					continue;
				}
				if (!axis.options.some((option) => option.id === optionId)) {
					errors.push(
						makeEditorError(
							"EDITOR_NODE_NOT_FOUND",
							`variant option "${optionId}" is not declared on axis "${axisId}"`,
							{
								nodeIds: [nodeId],
								details: { kind: "variantAxis", axisId, optionId },
							},
						),
					);
				}
			}
			resolvedNodeIds.push(nodeId);
			return {
				...item,
				props: writeComponentInstanceProp(props, {
					...instance,
					variantSelection: input.selection,
				}) as typeof item.props,
			};
		}),
	);

	if (errors.length > 0) {
		return {
			data: input.data,
			status: "rejected",
			resolvedNodeIds: NO_IDS,
			errors,
		};
	}
	if (deepEqualJson(input.data, nextData)) {
		return {
			data: input.data,
			status: "noop",
			resolvedNodeIds: NO_IDS,
			errors: [],
		};
	}
	return { data: nextData, status: "updated", resolvedNodeIds, errors: [] };
}

/** Dependencies of the variant commit helpers. */
export interface VariantCommitDeps {
	readonly getPuckApi: () => PuckApi;
}

/** Outcome of a variant commit attempt. */
export interface VariantCommitResult {
	readonly status: "committed" | "noop" | "rejected";
	readonly resolvedNodeIds: readonly string[];
	readonly errors: readonly EditorError[];
}

function commit(
	deps: VariantCommitDeps,
	run: (data: Data, config: Config) => UpdateVariantResult,
): VariantCommitResult {
	const api = deps.getPuckApi();
	const current = api.appState.data as Data;
	const config = api.config as Config;
	const result = run(current, config);
	if (result.status !== "updated") {
		return {
			status: result.status === "noop" ? "noop" : "rejected",
			resolvedNodeIds: NO_IDS,
			errors: result.errors,
		};
	}
	api.dispatch({
		type: "setData",
		recordHistory: true,
		data: (previous: Data) =>
			previous === current ? result.data : run(previous, config).data,
	} as Parameters<PuckApi["dispatch"]>[0]);
	return {
		status: "committed",
		resolvedNodeIds: result.resolvedNodeIds,
		errors: [],
	};
}

/** Commit one variant-model edit as ONE history entry. */
export function commitVariantModelUpdate(
	deps: VariantCommitDeps,
	definitionId: string,
	edit: VariantModelEdit,
): VariantCommitResult {
	return commit(deps, (data, config) =>
		updateVariantModelInData({ data, config, definitionId, edit }),
	);
}

/** Commit one instance variant-selection change as ONE history entry. */
export function commitInstanceSelection(
	deps: VariantCommitDeps,
	nodeIds: readonly string[],
	selection: Readonly<Record<string, string>>,
): VariantCommitResult {
	return commit(deps, (data, config) =>
		updateInstanceSelectionInData({ data, config, nodeIds, selection }),
	);
}
