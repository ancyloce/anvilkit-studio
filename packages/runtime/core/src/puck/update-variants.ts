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
	ComponentInstanceState,
	ComponentVariant,
	EditorError,
	JsonValue,
	NodeOverridePatch,
	SerializablePuckNode,
	VariantAxis,
	VariantAxisOption,
} from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import type { Config, Data, PuckApi } from "@puckeditor/core";
import { walkTree } from "@puckeditor/core";
import {
	materializeInstance,
	readComponentInstanceProp,
	validateVariantModel,
	variantCombinationCount,
	variantCombinationKey,
	writeComponentInstanceProp,
} from "../document-model/materialize.js";
import { makeEditorError } from "../editor/diagnostics.js";
import { deepEqualJson } from "../editor/patch.js";
import {
	parseComponentInstance,
	parseComponentLibrary,
} from "./read-appearance.js";
import { withComponentLibrary } from "./update-component-library.js";
import { type WriterGateDep, writerGateError } from "./writer-gate.js";

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
		case "delete-axis": {
			const remainingAxes = axes.filter((axis) => axis.id !== edit.axisId);
			// A variant's selection is keyed by axis; dropping the axis
			// drops that key from every variant so no variant keeps a
			// dangling reference.
			const rekeyed = definition.variants.map((variant) => {
				const { [edit.axisId]: _gone, ...selection } = variant.selection;
				return { ...variant, selection };
			});
			// Re-keying can make two variants address the SAME combination,
			// which `validateVariantModel` rejects as ambiguous — so without
			// this the removal would refuse and read to the user as "remove
			// failed". Collapsing to the first is the same rule
			// `delete-option` already applies when a variant stops being
			// selectable; the loss is reported as a warning by
			// {@link updateVariantModelInData} rather than being silent.
			// With no axes left nothing addresses a distinct combination at
			// all, so the whole list goes.
			const seen = new Set<string>();
			return {
				...definition,
				variantAxes: remainingAxes,
				variants:
					remainingAxes.length === 0
						? []
						: rekeyed.filter((variant) => {
								const key = variantCombinationKey(variant.selection);
								if (seen.has(key)) return false;
								seen.add(key);
								return true;
							}),
			};
		}
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
	// Declared variants an axis/option removal destroyed. Collapsing
	// them is *required* — an ambiguous model is rejected outright — but
	// they take their per-variant patches with them, and §14.2 permits
	// the loss without permitting it to be silent. A `warning`, not an
	// error: the edit committed, and this describes what it cost rather
	// than a reason to undo it.
	const droppedVariants =
		current.variants.length - nextDefinition.variants.length;
	const warnings: readonly EditorError[] =
		droppedVariants > 0
			? [
					makeEditorError(
						"EDITOR_COMMAND_CONFLICT",
						droppedVariants === 1
							? "1 declared variant was removed — it no longer addresses a distinct combination"
							: `${droppedVariants} declared variants were removed — they no longer address distinct combinations`,
						{
							severity: "warning",
							details: {
								kind: "componentVariant",
								definitionId: input.definitionId,
								reason: "variants-dropped",
								dropped: droppedVariants,
							},
						},
					),
				]
			: [];
	return {
		data: nextData,
		status: "updated",
		resolvedNodeIds,
		errors: warnings,
	};
}

/**
 * One override (or override property) dropped by a variant switch
 * (`CFX-C11`; ED-VARIANT-002).
 *
 * **What makes an override incompatible.** A definition's node *set*
 * is shared across variants — variant patches patch existing
 * definition nodes rather than restructuring the tree. What a variant
 * patch genuinely can change is which **props exist** on a node: a
 * patch may introduce a prop that no other combination has. An
 * instance override of such a prop is meaningful in the combination
 * that declares it and meaningless in one that does not.
 *
 * So compatibility is decided by resolving the definition under the
 * **new** combination (variant patch + exposed-prop defaults, but
 * deliberately *without* the instance's own overrides) and asking, per
 * override entry:
 *
 * - target definition node absent → the whole entry is incompatible;
 * - overridden prop key absent on that node → that key is
 *   incompatible, siblings survive;
 * - authoring families (layout/style/typography/hidden) are always
 *   compatible — they are presentation applied to a node that exists.
 *
 * Ported from the sidecar's `editor/components/variant-switch.ts` by
 * the `p3-002` completion `p3-009`'s gate required. The rule is
 * unchanged; the state it reads is the declared instance prop and the
 * `componentLibrary` root prop instead of `AuthoringStateV1`.
 */
export interface DroppedOverride {
	readonly instanceNodeId: string;
	readonly definitionNodeId: string;
	/** Absent when the whole entry went because the node is gone. */
	readonly propertyKey?: string;
	readonly reason: "node-absent" | "property-absent";
}

/** Index a materialized tree's nodes by their definition node id. */
function indexByDefinitionNode(
	node: SerializablePuckNode,
	instanceNodeId: string,
	into: Map<string, SerializablePuckNode>,
): void {
	const runtimeId = node.props.id;
	if (typeof runtimeId === "string") {
		const marker = `${instanceNodeId}::`;
		if (runtimeId.startsWith(marker)) {
			into.set(runtimeId.slice(marker.length), node);
		}
	}
	for (const value of Object.values(node.props)) {
		if (!Array.isArray(value)) {
			continue;
		}
		for (const entry of value) {
			if (
				typeof entry === "object" &&
				entry !== null &&
				!Array.isArray(entry) &&
				typeof (entry as { type?: unknown }).type === "string"
			) {
				indexByDefinitionNode(
					entry as unknown as SerializablePuckNode,
					instanceNodeId,
					into,
				);
			}
		}
	}
}

/**
 * The definition as it resolves under `selection`, with **no**
 * instance overrides applied — the baseline compatibility is judged
 * against.
 */
function resolveUnderSelection(
	instanceNodeId: string,
	instance: ComponentInstanceState,
	selection: Readonly<Record<string, string>>,
	definitions: Readonly<Record<string, ComponentDefinition>>,
): Map<string, SerializablePuckNode> | undefined {
	const probe = materializeInstance(
		instanceNodeId,
		{
			...instance,
			variantSelection: selection,
			// Deliberately cleared: an override must not vouch for itself.
			nodeOverrides: {},
		},
		definitions,
	);
	if (probe.status !== "materialized") {
		return undefined;
	}
	const index = new Map<string, SerializablePuckNode>();
	indexByDefinitionNode(probe.node, instanceNodeId, index);
	return index;
}

/**
 * Partition an instance's overrides into those that still apply under
 * `resolved` and those that do not, recording each drop.
 */
function preserveCompatibleOverrides(
	instanceNodeId: string,
	nodeOverrides: Readonly<Record<string, NodeOverridePatch>>,
	resolved: ReadonlyMap<string, SerializablePuckNode>,
	dropped: DroppedOverride[],
): Record<string, NodeOverridePatch> {
	const kept: Record<string, NodeOverridePatch> = {};
	for (const [definitionNodeId, patch] of Object.entries(nodeOverrides)) {
		const node = resolved.get(definitionNodeId);
		if (node === undefined) {
			dropped.push({
				instanceNodeId,
				definitionNodeId,
				reason: "node-absent",
			});
			continue;
		}
		if (patch.props === undefined) {
			kept[definitionNodeId] = patch;
			continue;
		}
		const keptProps: Record<string, JsonValue> = {};
		for (const [key, value] of Object.entries(patch.props)) {
			if (Object.hasOwn(node.props, key)) {
				keptProps[key] = value;
			} else {
				dropped.push({
					instanceNodeId,
					definitionNodeId,
					propertyKey: key,
					reason: "property-absent",
				});
			}
		}
		const hasFamilies =
			patch.layout !== undefined ||
			patch.style !== undefined ||
			patch.typography !== undefined ||
			patch.hidden !== undefined;
		if (Object.keys(keptProps).length === 0) {
			if (hasFamilies) {
				const { props: _dropped, ...rest } = patch;
				kept[definitionNodeId] = rest;
			}
			continue;
		}
		kept[definitionNodeId] = { ...patch, props: keptProps };
	}
	return kept;
}

/**
 * Dropped overrides as user-facing diagnostics (ED-VARIANT-002's
 * "never silently discard").
 *
 * These are **warnings**, not errors: the switch is legitimate and
 * proceeds. That distinction is load-bearing — see the severity
 * partition in {@link updateInstanceSelectionInData}, where treating
 * them as errors would reject the very switch they are reporting on.
 */
export function droppedOverrideDiagnostics(
	dropped: readonly DroppedOverride[],
): readonly EditorError[] {
	return dropped.map((entry) =>
		makeEditorError(
			"EDITOR_NODE_NOT_FOUND",
			entry.propertyKey === undefined
				? `override on definition node "${entry.definitionNodeId}" does not apply to the selected variant and was removed`
				: `override of "${entry.propertyKey}" on definition node "${entry.definitionNodeId}" does not apply to the selected variant and was removed`,
			{
				severity: "warning",
				nodeIds: [entry.instanceNodeId],
				details: {
					kind: "incompatibleOverride",
					definitionNodeId: entry.definitionNodeId,
					propertyKey: entry.propertyKey,
					reason: entry.reason,
				},
			},
		),
	);
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
 * Set the variant selection on one or more instances, keeping every
 * override that still applies and reporting each one that does not.
 *
 * Writes the instance's **declared node prop** — never the definition.
 * An option that the definition does not declare is rejected before
 * anything writes, so an instance cannot come to hold a selection the
 * model cannot express.
 *
 * `CFX-C11` / ED-VARIANT-002 live here: an override that the new
 * combination cannot express is removed **and reported**, never
 * silently kept as dead freight nor silently dropped. Exposed-property
 * overrides are definition-level and survive every switch, so they are
 * never touched.
 */
export function updateInstanceSelectionInData(
	input: UpdateInstanceSelectionInput,
): UpdateVariantResult {
	const errors: EditorError[] = [];
	const dropped: DroppedOverride[] = [];
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

			// Compatibility is judged against the definition resolved under
			// the NEW combination. A carrier we cannot parse, or a probe
			// that fails to materialize, leaves overrides untouched: it is
			// never correct to discard an override because the *check*
			// could not run.
			const parsed = parseComponentInstance(instance);
			const nextOverrides =
				parsed === undefined
					? undefined
					: (() => {
							const resolved = resolveUnderSelection(
								nodeId,
								parsed,
								input.selection,
								library?.definitions ?? {},
							);
							return resolved === undefined
								? undefined
								: preserveCompatibleOverrides(
										nodeId,
										parsed.nodeOverrides,
										resolved,
										dropped,
									);
						})();

			return {
				...item,
				props: writeComponentInstanceProp(props, {
					...instance,
					variantSelection: input.selection,
					...(nextOverrides !== undefined
						? { nodeOverrides: nextOverrides }
						: {}),
				}) as typeof item.props,
			};
		}),
	);

	// Warnings must not reject the switch they are reporting on, so the
	// gate is severity-based rather than a bare length check.
	const warnings = droppedOverrideDiagnostics(dropped);
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
			errors: warnings,
		};
	}
	return {
		data: nextData,
		status: "updated",
		resolvedNodeIds,
		errors: warnings,
	};
}

/** Dependencies of the variant commit helpers. */
export interface VariantCommitDeps extends WriterGateDep {
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
	const gate = writerGateError(deps);
	if (gate !== null) {
		return { status: "rejected", resolvedNodeIds: NO_IDS,  errors: [gate] };
	}
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
		// Warnings survive a successful commit — `CFX-C11`'s dropped
		// overrides are reported *because* the switch went through. A
		// hard error would have forced `rejected` above, so anything
		// reaching here is advisory by construction.
		errors: result.errors,
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
