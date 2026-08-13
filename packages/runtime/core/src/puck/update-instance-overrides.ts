/**
 * @file Instance overrides, reset/promote, and detach (PLAN-0026 §3.4,
 * §3.8.1; DD-0019 `ED-FA-002`). Pure and React-free.
 *
 * Where each thing lives (contract rule 2):
 *
 * - an **exposed-prop override** and a **node override** are per-instance
 *   render state → the instance node's declared prop;
 * - **promote** pushes an instance's node override up into the shared
 *   definition → the declared root prop `root.props.componentLibrary`;
 * - **detach** produces plain `Data` nodes with **new ids** and no
 *   residual link — no shadow record, nothing pointing back (rule 5).
 *
 * Every operation is ONE `setData` and therefore one undo step, even
 * when it touches both the instance node and the definition (promote)
 * or splices a whole subtree (detach).
 *
 * The instance link is written through `writeComponentInstanceProp`, so
 * every write here emits only `anvilComponentInstance` and strips the
 * legacy spelling from the node it touches (`p3-003`, PLAN-0026 §2).
 */

import type {
	ComponentDefinition,
	ComponentInstanceState,
	EditorError,
	JsonValue,
	NodeOverridePatch,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import type { Config, Data, PuckApi } from "@puckeditor/core";
import { walkTree } from "@puckeditor/core";
import {
	materializeInstance,
	readComponentInstanceProp,
	writeComponentInstanceProp,
} from "../document-model/materialize.js";
import { makeEditorError } from "../editor/diagnostics.js";
import { deepEqualJson } from "../editor/patch.js";
import {
	createStableIdAllocator,
	type NodeIdAllocator,
} from "../react/editor/native-tree.js";
import { dispatchOneIntent, failureStatus } from "./commit-protocol.js";
import { parseComponentLibrary } from "./read-appearance.js";
import {
	countDefinitionInstances,
	updateComponentLibraryInData,
	withComponentLibrary,
} from "./update-component-library.js";
import { type WriterGateDep, writerGateError } from "./writer-gate.js";

/** One override/reset/promote intent against an instance. */
export type InstanceOverrideEdit =
	| {
			readonly kind: "set-exposed-prop";
			readonly propId: string;
			readonly value: JsonValue;
	  }
	| { readonly kind: "reset-exposed-prop"; readonly propId: string }
	| {
			readonly kind: "set-node-override";
			readonly definitionNodeId: string;
			readonly patch: NodeOverridePatch;
	  }
	| {
			readonly kind: "reset-node-override";
			readonly definitionNodeId: string;
	  }
	/** Reset every override on the instance — props and nodes alike. */
	| { readonly kind: "reset-all" }
	/**
	 * Push one node override up into the definition, and remove it from
	 * the instance in the same commit — the override becomes shared, and
	 * the instance is left clean rather than redundantly re-stating it.
	 */
	| { readonly kind: "promote"; readonly definitionNodeId: string };

/** Input to {@link updateInstanceOverridesInData}. */
export interface UpdateInstanceOverridesInput {
	readonly data: Data;
	readonly config: Config;
	/** Plural: the same intent may apply across a multi-select. */
	readonly nodeIds: readonly string[];
	readonly edit: InstanceOverrideEdit;
}

/** Outcome of an override write. */
export interface UpdateInstanceOverridesResult {
	readonly data: Data;
	readonly status: "updated" | "noop" | "rejected";
	readonly changedNodeIds: readonly string[];
	readonly errors: readonly EditorError[];
}

const NO_IDS: readonly string[] = Object.freeze([]);

function instanceOf(
	props: Readonly<Record<string, unknown>>,
): ComponentInstanceState | undefined {
	const raw = readComponentInstanceProp(props);
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return undefined;
	}
	return typeof (raw as { definitionId?: unknown }).definitionId === "string"
		? (raw as unknown as ComponentInstanceState)
		: undefined;
}

/** Apply one edit to an instance's carrier. Pure. */
function applyToInstance(
	instance: ComponentInstanceState,
	edit: InstanceOverrideEdit,
): ComponentInstanceState {
	switch (edit.kind) {
		case "set-exposed-prop":
			return {
				...instance,
				propOverrides: { ...instance.propOverrides, [edit.propId]: edit.value },
			};
		case "reset-exposed-prop": {
			const { [edit.propId]: _gone, ...rest } = instance.propOverrides;
			return { ...instance, propOverrides: rest };
		}
		case "set-node-override":
			return {
				...instance,
				nodeOverrides: {
					...instance.nodeOverrides,
					[edit.definitionNodeId]: edit.patch,
				},
			};
		case "reset-node-override":
		case "promote": {
			const { [edit.definitionNodeId]: _gone, ...rest } =
				instance.nodeOverrides;
			return { ...instance, nodeOverrides: rest };
		}
		case "reset-all":
			return { ...instance, propOverrides: {}, nodeOverrides: {} };
	}
}

/**
 * Override / reset / promote across a selection of instances.
 *
 * **Reset restores the inherited value, not a default.** Removing the
 * entry from the carrier is what does that: the §14.4 cascade then
 * resolves the property from the layer below (variant patch, or the
 * definition base), which is a different value from any control's
 * default and the reason reset is a removal rather than a write.
 */
export function updateInstanceOverridesInData(
	input: UpdateInstanceOverridesInput,
): UpdateInstanceOverridesResult {
	const errors: EditorError[] = [];
	const changedNodeIds: string[] = [];
	const selected = new Set(input.nodeIds);

	// `promote` also edits the definition, so collect what to lift first.
	const promoted = new Map<string, NodeOverridePatch>();
	if (input.edit.kind === "promote") {
		walkTree(input.data, input.config, (content) => {
			for (const item of content) {
				const props = item.props as Record<string, unknown>;
				const nodeId = props.id;
				if (typeof nodeId !== "string" || !selected.has(nodeId)) continue;
				const instance = instanceOf(props);
				const patch =
					instance?.nodeOverrides[
						(input.edit as { definitionNodeId: string }).definitionNodeId
					];
				if (instance !== undefined && patch !== undefined) {
					promoted.set(instance.definitionId, patch);
				}
			}
			return content;
		});
		if (promoted.size === 0) {
			errors.push(
				makeEditorError(
					"EDITOR_NODE_NOT_FOUND",
					`no selected instance carries an override for definition node "${input.edit.definitionNodeId}"`,
					{ details: { kind: "componentDefinition" } },
				),
			);
			return {
				data: input.data,
				status: "rejected",
				changedNodeIds: NO_IDS,
				errors,
			};
		}
	}

	let nextData = walkTree(input.data, input.config, (content) =>
		content.map((item) => {
			const props = item.props as Record<string, unknown>;
			const nodeId = props.id;
			if (typeof nodeId !== "string" || !selected.has(nodeId)) return item;
			const instance = instanceOf(props);
			if (instance === undefined) return item;
			const next = applyToInstance(instance, input.edit);
			if (deepEqualJson(instance, next)) return item;
			changedNodeIds.push(nodeId);
			return {
				...item,
				props: writeComponentInstanceProp(props, next) as typeof item.props,
			};
		}),
	);

	// Promote lifts the patch into the definition in the SAME `Data`, so
	// "make this shared" is one undo step rather than two.
	if (input.edit.kind === "promote" && promoted.size > 0) {
		const raw = (nextData.root?.props as { componentLibrary?: unknown })
			?.componentLibrary;
		const library = raw === undefined ? undefined : parseComponentLibrary(raw);
		if (raw !== undefined && library === undefined) {
			errors.push(
				makeEditorError(
					"EDITOR_CONTRACT_UNSUPPORTED_VERSION",
					"root.props.componentLibrary fails validation; refusing to overwrite it",
				),
			);
			return {
				data: input.data,
				status: "rejected",
				changedNodeIds: NO_IDS,
				errors,
			};
		}
		const definitions: Record<string, ComponentDefinition> = {
			...(library?.definitions ?? {}),
		};
		for (const [definitionId, patch] of promoted) {
			const definition = definitions[definitionId];
			if (definition === undefined) continue;
			definitions[definitionId] = {
				...definition,
				root: applyPatchToDefinitionNode(
					definition.root,
					input.edit.definitionNodeId,
					patch,
				),
			};
		}
		nextData = withComponentLibrary(nextData, { definitions });
	}

	if (changedNodeIds.length === 0 || deepEqualJson(input.data, nextData)) {
		return {
			data: input.data,
			status: "noop",
			changedNodeIds: NO_IDS,
			errors: [],
		};
	}
	return {
		data: nextData,
		status: "updated",
		changedNodeIds: changedNodeIds.sort(),
		errors: [],
	};
}

/** Merge a promoted patch's props into the definition's own node. */
function applyPatchToDefinitionNode(
	node: SerializablePuckNode,
	definitionNodeId: string,
	patch: NodeOverridePatch,
): SerializablePuckNode {
	const props = node.props as Record<string, JsonValue>;
	const isTarget = props.id === definitionNodeId;
	const nextProps: Record<string, JsonValue> = isTarget
		? { ...props, ...(patch.props ?? {}) }
		: { ...props };
	let changed = isTarget;
	for (const [key, value] of Object.entries(props)) {
		if (!Array.isArray(value)) continue;
		const mapped = value.map((entry) =>
			typeof entry === "object" &&
			entry !== null &&
			!Array.isArray(entry) &&
			typeof (entry as { type?: unknown }).type === "string"
				? (applyPatchToDefinitionNode(
						entry as unknown as SerializablePuckNode,
						definitionNodeId,
						patch,
					) as unknown as JsonValue)
				: entry,
		);
		nextProps[key] = mapped as unknown as JsonValue;
		changed = true;
	}
	return changed ? { type: node.type, props: nextProps } : node;
}

/** Input to {@link detachInstanceInData}. */
export interface DetachInstanceInput {
	readonly data: Data;
	readonly config: Config;
	readonly nodeIds: readonly string[];
	/**
	 * Fresh id factory. Ids are **caller-generated, never derived** —
	 * reusing the definition's internal ids would collide the moment a
	 * second instance of the same definition is detached.
	 */
	readonly generateId: (type: string) => string;
}

/** Give every node in a materialized subtree a brand-new id. */
function withFreshIds(
	node: SerializablePuckNode,
	allocateId: NodeIdAllocator,
	assigned: string[],
): SerializablePuckNode {
	const props: Record<string, JsonValue> = { ...node.props };
	const sourceId =
		typeof node.props.id === "string" ? node.props.id : undefined;
	const freshId = allocateId(node.type, sourceId);
	props.id = freshId;
	assigned.push(freshId);
	// A detached node is a plain node: nothing points back at the
	// definition it came from (rule 5). One key, because `p7-002`
	// renamed the last stored occurrence of the legacy spelling.
	delete props.anvilComponentInstance;
	for (const [key, value] of Object.entries(node.props)) {
		if (!Array.isArray(value)) continue;
		props[key] = value.map((entry) =>
			typeof entry === "object" &&
			entry !== null &&
			!Array.isArray(entry) &&
			typeof (entry as { type?: unknown }).type === "string"
				? (withFreshIds(
						entry as unknown as SerializablePuckNode,
						allocateId,
						assigned,
					) as unknown as JsonValue)
				: entry,
		) as unknown as JsonValue;
	}
	return { type: node.type, props };
}

/** Outcome of a detach. */
export interface DetachInstanceResult extends UpdateInstanceOverridesResult {
	/** Instance node id → the fresh root id that replaced it. */
	readonly replacements: Readonly<Record<string, string>>;
	/** Every id the detach minted, for collision checking. */
	readonly assignedIds: readonly string[];
}

/**
 * Detach instances into plain nodes with new ids, as ONE history entry.
 *
 * An instance that cannot be materialized — unresolvable definition,
 * cycle, or depth — **rejects** rather than half-succeeding, leaving the
 * instance data untouched (`ED-COMP-007`).
 */
export function detachInstanceInData(
	input: DetachInstanceInput,
): DetachInstanceResult {
	return detachInstanceWithAllocator(input, (type) => input.generateId(type));
}

/** Internal replay-aware detach path; the public pure helper stays unchanged. */
function detachInstanceWithAllocator(
	input: DetachInstanceInput,
	allocateId: NodeIdAllocator,
): DetachInstanceResult {
	const errors: EditorError[] = [];
	const replacements: Record<string, string> = {};
	const assignedIds: string[] = [];
	const changedNodeIds: string[] = [];
	const selected = new Set(input.nodeIds);

	const raw = (input.data.root?.props as { componentLibrary?: unknown })
		?.componentLibrary;
	const definitions =
		(raw === undefined ? undefined : parseComponentLibrary(raw))?.definitions ??
		{};

	const nextData = walkTree(input.data, input.config, (content) =>
		content.map((item) => {
			const props = item.props as Record<string, unknown>;
			const nodeId = props.id;
			if (typeof nodeId !== "string" || !selected.has(nodeId)) return item;
			const instance = instanceOf(props);
			if (instance === undefined) return item;
			const result = materializeInstance(nodeId, instance, definitions);
			if (result.status !== "materialized") {
				errors.push(
					makeEditorError(
						result.status === "missing-definition"
							? "EDITOR_DEFINITION_UNAVAILABLE"
							: "EDITOR_COMPONENT_CYCLE",
						`instance "${nodeId}" cannot be detached: ${result.status}`,
						{ nodeIds: [nodeId], details: { kind: "componentDefinition" } },
					),
				);
				return item;
			}
			const fresh = withFreshIds(result.node, allocateId, assignedIds);
			replacements[nodeId] = fresh.props.id as string;
			changedNodeIds.push(nodeId);
			return { ...item, ...fresh } as typeof item;
		}),
	);

	if (errors.length > 0) {
		return {
			data: input.data,
			status: "rejected",
			changedNodeIds: NO_IDS,
			errors,
			replacements: {},
			assignedIds: NO_IDS,
		};
	}
	if (changedNodeIds.length === 0) {
		return {
			data: input.data,
			status: "noop",
			changedNodeIds: NO_IDS,
			errors: [],
			replacements: {},
			assignedIds: NO_IDS,
		};
	}
	return {
		data: nextData,
		status: "updated",
		changedNodeIds: changedNodeIds.sort(),
		errors: [],
		replacements,
		assignedIds,
	};
}

/** Dependencies of the instance commit helpers. */
export interface InstanceCommitDeps extends WriterGateDep {
	readonly getPuckApi: () => PuckApi;
}

/** Outcome of an instance commit attempt. */
export interface InstanceCommitResult {
	readonly status: "committed" | "noop" | "rejected";
	readonly changedNodeIds: readonly string[];
	readonly errors: readonly EditorError[];
}

function commit(
	deps: InstanceCommitDeps,
	run: (data: Data, config: Config) => UpdateInstanceOverridesResult,
): InstanceCommitResult {
	const gate = writerGateError(deps);
	if (gate !== null) {
		return { status: "rejected", changedNodeIds: NO_IDS, errors: [gate] };
	}
	const api = deps.getPuckApi();
	const config = api.config as Config;
	const attempt = dispatchOneIntent<UpdateInstanceOverridesResult>(
		api,
		(data) => run(data, config),
	);
	if (!attempt.committed) {
		return {
			status: failureStatus(attempt.outcome),
			changedNodeIds: NO_IDS,
			errors: attempt.outcome.errors,
		};
	}
	return {
		status: "committed",
		changedNodeIds: attempt.outcome.changedNodeIds,
		errors: [],
	};
}

/** Commit one override/reset/promote intent as ONE history entry. */
export function commitInstanceOverride(
	deps: InstanceCommitDeps,
	nodeIds: readonly string[],
	edit: InstanceOverrideEdit,
): InstanceCommitResult {
	return commit(deps, (data, config) =>
		updateInstanceOverridesInData({ data, config, nodeIds, edit }),
	);
}

/** Commit a detach as ONE history entry. */
export function commitDetachInstance(
	deps: InstanceCommitDeps,
	nodeIds: readonly string[],
	generateId: (type: string) => string,
): InstanceCommitResult {
	// ONE allocator for this intent, created OUTSIDE `run`. The commit
	// protocol may replay the detach against a document that moved before
	// Puck reduced the action; materialized runtime ids provide stable,
	// per-instance source keys for every node in the detached subtree.
	const allocateId = createStableIdAllocator(generateId);
	return commit(deps, (data, config) =>
		detachInstanceWithAllocator(
			{ data, config, nodeIds, generateId },
			allocateId,
		),
	);
}

/** Input to {@link detachAllAndDeleteDefinitionInData}. */
export interface DeleteDefinitionWithDetachInput {
	readonly data: Data;
	readonly config: Config;
	readonly definitionId: string;
	/** Fresh id factory for the detached nodes; never derived here. */
	readonly generateId: (type: string) => string;
}

/**
 * A hard ceiling on detach passes, so a `detachInstanceInData` that
 * unexpectedly stops making progress cannot spin. Each pass clears up
 * to the §14.6 report cap (50), so this covers 5 000 instances —
 * three orders of magnitude past anything the editor produces.
 */
const MAX_DETACH_PASSES = 100;

/**
 * Detach every live instance of a definition and remove the
 * definition, in ONE `Data` (DD-0019 §14.6).
 *
 * The §14.6 lifecycle is "prompt, offer detach-all, never silently
 * orphan". `updateComponentLibraryInData` supplies the refusal half —
 * a referenced definition cannot be deleted — and this supplies the
 * accepted half. Both halves must land in a single `Data` so the whole
 * thing is one undo: a document where the instances were detached but
 * the definition survived (or worse, the reverse) is a state the user
 * never asked for and cannot get out of with one Ctrl+Z.
 *
 * **Why a loop.** `countDefinitionInstances` caps its id list at 50
 * (§14.6's report cap) while its `count` does not, so a document with
 * more than 50 instances needs more than one pass. A single capped
 * pass would delete the definition while instances still referenced
 * it — precisely the silent orphaning the section forbids.
 *
 * A detach that cannot be performed (unresolvable definition, cycle,
 * depth) **rejects and deletes nothing**, so `ED-COMP-007`'s retention
 * guarantee survives a failed lifecycle operation.
 */
export function detachAllAndDeleteDefinitionInData(
	input: DeleteDefinitionWithDetachInput,
): DetachInstanceResult {
	const replacements: Record<string, string> = {};
	const assignedIds: string[] = [];
	const changedNodeIds: string[] = [];
	let data = input.data;

	const refuse = (errors: readonly EditorError[]): DetachInstanceResult => ({
		data: input.data,
		status: "rejected",
		changedNodeIds: NO_IDS,
		errors,
		replacements: {},
		assignedIds: NO_IDS,
	});

	for (let pass = 0; pass < MAX_DETACH_PASSES; pass += 1) {
		const usage = countDefinitionInstances(
			data,
			input.config,
			input.definitionId,
		);
		if (usage.count === 0) break;
		const detached = detachInstanceInData({
			data,
			config: input.config,
			nodeIds: usage.instanceNodeIds,
			generateId: input.generateId,
		});
		// `noop` here would mean instances exist that the detach declined
		// to touch — no progress, so stop rather than loop.
		if (detached.status !== "updated") {
			return refuse(detached.errors);
		}
		data = detached.data;
		Object.assign(replacements, detached.replacements);
		assignedIds.push(...detached.assignedIds);
		changedNodeIds.push(...detached.changedNodeIds);
	}

	const dropped = updateComponentLibraryInData({
		data,
		config: input.config,
		edit: {
			kind: "delete",
			definitionId: input.definitionId,
			// The detach above is what this policy authorises; the delete
			// itself now sees zero instances either way.
			policy: "confirm-detach-all",
		},
	});
	if (dropped.status === "rejected") {
		return refuse(dropped.errors);
	}
	if (dropped.status === "noop" && changedNodeIds.length === 0) {
		return {
			data: input.data,
			status: "noop",
			changedNodeIds: NO_IDS,
			errors: [],
			replacements: {},
			assignedIds: NO_IDS,
		};
	}
	return {
		data: dropped.data,
		status: "updated",
		changedNodeIds: changedNodeIds.sort(),
		errors: [],
		replacements,
		assignedIds,
	};
}

/**
 * Commit detach-all-and-delete as ONE history entry, so a single undo
 * restores the definition *and* every instance's reference (§14.6).
 */
export function commitDetachAllAndDeleteDefinition(
	deps: InstanceCommitDeps,
	definitionId: string,
	generateId: (type: string) => string,
): InstanceCommitResult {
	return commit(deps, (data, config) =>
		detachAllAndDeleteDefinitionInData({
			data,
			config,
			definitionId,
			generateId,
		}),
	);
}
