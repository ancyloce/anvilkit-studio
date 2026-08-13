/**
 * @file Tree operations over the public `PuckApi` (PLAN-0026 §3.4,
 * §1 rule 4). Pure core + thin commit helpers, React-free.
 *
 * Insert, duplicate, delete and reorder are the operations most
 * obviously Puck's own, and the sidecar routed them through a command
 * engine anyway. They go back on the public surface here: `dispatch`,
 * `getPermissions`, and the official action types. There is no
 * intermediate vocabulary, so nothing about a tree operation could
 * become a parallel IR (rule 5).
 *
 * ## Zones address SLOTS, not the legacy zone map
 *
 * A zone id is `"<parentId>:<propName>"`, which is exactly Puck's own
 * `walkTree` coordinate pair — `"root:default-zone"` for top-level
 * content, `"<nodeId>:<slot>"` for a slot. Resolution goes through
 * `transformContainers`, so a slot zone lands in the owner's
 * `props.<slot>` where Puck renders it.
 *
 * This file used to enumerate containers as "`data.content` plus
 * `data.zones`" and write there. `data.zones` is Puck's **legacy
 * DropZone map**: a node inserted into `data.zones["abc:content"]` is
 * invisible to a slot-field container, and Puck's `migrate()` throws on
 * entries it cannot place. Reorder had the mirror bug — a node living
 * in `props.<slot>` was simply not found, so a legitimate move reported
 * `EDITOR_NODE_NOT_FOUND` (review 0036 H-2).
 *
 * ## The zone trap
 *
 * Puck's root zone is **`"root:default-zone"`**. A dispatch using the
 * bare `"default-zone"` silently targets nothing, which is the worst
 * possible failure mode for a tree edit. Every entry point here
 * normalizes through {@link normalizeZone} rather than trusting its
 * caller. An unresolvable zone is now **rejected** rather than
 * conjured into existence.
 *
 * ## Multi-node operations are ONE history entry
 *
 * Deleting a three-node selection is one undo, not three. A loop over
 * `dispatch` would record N entries and force the user to press undo N
 * times to get back where they started; the whole selection is folded
 * into a single functional `setData` instead.
 *
 * ## Duplicating an instance yields an instance
 *
 * The subtree transforms come from the React-free editor tree layer.
 * Duplication remaps **node** ids only; the component-instance link
 * references a `definitionId` and definition-node ids, neither of which
 * are page node ids — so a duplicated instance stays an instance of the
 * same definition rather than silently becoming a detached copy.
 */

import type { EditorError } from "@anvilkit/contracts/editor";
import type { Config, Data, PuckApi } from "@puckeditor/core";
import { makeEditorError } from "../editor/diagnostics.js";
import {
	collectSubtreeIds,
	containerZoneId,
	indexNodeLocations,
	isComponentNode,
	type PuckTreeNode,
	parseZoneId,
	nodeId as readNodeId,
	transformContainers,
	zonesOf,
} from "../editor/tree/nodes.js";
import {
	createStableIdAllocator,
	duplicateNode,
	type NodeIdAllocator,
	removeNode,
} from "../editor/tree/transforms.js";
import { dispatchOneIntent, failureStatus } from "./commit-protocol.js";
import { isNodeLocked } from "./update-annotations.js";
import { type WriterGateDep, writerGateError } from "./writer-gate.js";

/** Puck's root zone, in the only form `dispatch` honours. */
export const ROOT_ZONE = "root:default-zone";

/**
 * Normalize a zone id to the form Puck's reducer matches.
 *
 * A bare `"default-zone"` (or an omitted zone) becomes
 * {@link ROOT_ZONE}. Slot zones (`"<nodeId>:<slotName>"`) already carry
 * their owner and pass through unchanged — and now actually resolve to
 * that owner's slot prop.
 */
export function normalizeZone(zone: string | undefined): string {
	if (zone === undefined || zone === "" || zone === "default-zone") {
		return ROOT_ZONE;
	}
	return zone;
}

/** Outcome of a pure tree update. */
export interface UpdateTreeResult {
	/** The next document; the INPUT reference when nothing changed. */
	readonly data: Data;
	readonly status: "updated" | "noop" | "rejected";
	/** Ids created by the operation (duplicate/insert). */
	readonly createdNodeIds: readonly string[];
	readonly errors: readonly EditorError[];
}

const NO_IDS: readonly string[] = Object.freeze([]);

function noop(data: Data): UpdateTreeResult {
	return { data, status: "noop", createdNodeIds: NO_IDS, errors: [] };
}

function rejected(data: Data, error: EditorError): UpdateTreeResult {
	return { data, status: "rejected", createdNodeIds: NO_IDS, errors: [error] };
}

/** The error for a zone id that does not resolve to a container. */
function unknownZone(zone: string): EditorError {
	return makeEditorError(
		"EDITOR_NODE_NOT_FOUND",
		`zone "${zone}" does not resolve to a slot in this document; a slot zone must be "<nodeId>:<slotName>" naming a slot the component declares`,
		{ details: { zone } },
	);
}

/** Reject an atomic tree intent when any requested node is absent. */
function rejectMissingNodes(
	data: Data,
	nodeIds: readonly string[],
	config: Config,
	operation: string,
): UpdateTreeResult | null {
	const locations = indexNodeLocations(data, config);
	const missing = nodeIds.filter((id) => !locations.has(id));
	if (missing.length === 0) return null;
	return rejected(
		data,
		makeEditorError(
			"EDITOR_NODE_NOT_FOUND",
			`${operation} targets nodes that are not in the document`,
			{ nodeIds: missing, details: { kind: "node", operation } },
		),
	);
}

/** Index of `targetId` within `items`, or `-1`. */
function indexOfNode(items: readonly unknown[], targetId: string): number {
	return items.findIndex(
		(entry) => isComponentNode(entry) && readNodeId(entry) === targetId,
	);
}

/**
 * Delete every node in a selection, in ONE document update.
 *
 * Tree intents are atomic: if any selected id is absent, reject without
 * deleting the remaining nodes. This matches carrier and create-component
 * writes and prevents a stale mixed selection from partially succeeding.
 */
export function deleteNodesInData(
	data: Data,
	nodeIds: readonly string[],
	config: Config,
): UpdateTreeResult {
	const missing = rejectMissingNodes(data, nodeIds, config, "delete");
	if (missing !== null) return missing;
	let next = data;
	let changed = false;
	for (const nodeId of nodeIds) {
		const removed = removeNode(next, nodeId, config);
		if (removed === null) continue;
		next = removed;
		changed = true;
	}
	return changed
		? { data: next, status: "updated", createdNodeIds: NO_IDS, errors: [] }
		: noop(data);
}

/**
 * Duplicate every node in a selection, in ONE document update.
 *
 * Each copy gets fresh ids for its whole subtree; component-instance
 * links inside a copied subtree survive, so duplicating an instance
 * produces a second instance of the same definition.
 *
 * Pass `allocate` to make the ids reproducible across repeated calls for
 * the same intent — {@link commitDuplicateNodes} does, because its retry
 * path re-runs this against a newer document.
 */
export function duplicateNodesInData(
	data: Data,
	nodeIds: readonly string[],
	config: Config,
	allocate?: NodeIdAllocator,
): UpdateTreeResult {
	const missing = rejectMissingNodes(data, nodeIds, config, "duplicate");
	if (missing !== null) return missing;
	let next = data;
	const createdNodeIds: string[] = [];
	for (const nodeId of nodeIds) {
		const copied = duplicateNode(next, nodeId, config, allocate);
		if (copied === null) continue;
		next = copied.data;
		createdNodeIds.push(copied.newRootId);
	}
	return createdNodeIds.length > 0
		? { data: next, status: "updated", createdNodeIds, errors: [] }
		: noop(data);
}

/** Input to {@link reorderNodeInData}. */
export interface ReorderNodeInput {
	readonly data: Data;
	/** The live Puck config — the authority on which props are slots. */
	readonly config: Config;
	readonly nodeId: string;
	/** Destination zone; normalized, so a bare name is accepted. */
	readonly zone?: string;
	readonly toIndex: number;
}

/**
 * Move a node to a new index within a zone (or into another zone).
 *
 * Reordering across zones is a remove-then-insert on the same document,
 * so it stays one update and therefore one history entry.
 *
 * Moving a node into its own subtree is rejected: it would detach the
 * branch from the document entirely.
 */
export function reorderNodeInData(input: ReorderNodeInput): UpdateTreeResult {
	const targetZone = normalizeZone(input.zone);

	// Pass 1 — locate the node and the container it currently sits in.
	let moved: unknown;
	let sourceZone: string | undefined;
	let sourceIndex = -1;
	transformContainers(input.data, input.config, (items, at) => {
		if (moved !== undefined) return items;
		const index = indexOfNode(items, input.nodeId);
		if (index === -1) return items;
		moved = items[index];
		sourceZone = containerZoneId(at);
		sourceIndex = index;
		return items;
	});
	if (moved === undefined || sourceZone === undefined) {
		return rejected(
			input.data,
			makeEditorError(
				"EDITOR_NODE_NOT_FOUND",
				`node "${input.nodeId}" is not in the document`,
				{ details: { nodeId: input.nodeId } },
			),
		);
	}

	// A node cannot become its own ancestor's child.
	const subtreeIds = new Set<string>();
	collectSubtreeIds(
		moved as PuckTreeNode,
		input.config,
		zonesOf(input.data),
		subtreeIds,
	);
	if (subtreeIds.has(parseZoneId(targetZone).parentId)) {
		return rejected(
			input.data,
			makeEditorError(
				"EDITOR_COMPONENT_CYCLE",
				`node "${input.nodeId}" cannot be moved into its own subtree`,
				{ details: { nodeId: input.nodeId, zone: targetZone } },
			),
		);
	}

	// Pass 2 — remove from the source container and insert into the
	// target. When they are the same container both happen to the same
	// array, which is what makes an in-place reorder one operation.
	let sawTarget = false;
	const next = transformContainers(input.data, input.config, (items, at) => {
		const zone = containerZoneId(at);
		const isSource = zone === sourceZone;
		const isTarget = zone === targetZone;
		if (!isSource && !isTarget) return items;
		let out: readonly unknown[] = items;
		if (isSource) {
			out = [...out.slice(0, sourceIndex), ...out.slice(sourceIndex + 1)];
		}
		if (isTarget) {
			sawTarget = true;
			const clamped = Math.max(0, Math.min(input.toIndex, out.length));
			out = [...out.slice(0, clamped), moved, ...out.slice(clamped)];
		}
		return out;
	});
	if (!sawTarget) {
		return rejected(input.data, unknownZone(targetZone));
	}
	return {
		data: next,
		status: "updated",
		createdNodeIds: NO_IDS,
		errors: [],
	};
}

/** Input to {@link insertNodeInData}. */
export interface InsertNodeInput {
	readonly data: Data;
	/** The live Puck config — the authority on which props are slots. */
	readonly config: Config;
	readonly type: string;
	/** Caller-generated id — never derived here. */
	readonly nodeId: string;
	readonly zone?: string;
	readonly index?: number;
	readonly props?: Readonly<Record<string, unknown>>;
}

/**
 * Insert a new node into a zone at an index.
 *
 * A zone that does not resolve to a container is rejected. It used to
 * be conjured into `data.zones`, which produced a node no renderer
 * would ever show (review 0036 H-2).
 */
export function insertNodeInData(input: InsertNodeInput): UpdateTreeResult {
	const targetZone = normalizeZone(input.zone);
	let inserted = false;
	const next = transformContainers(input.data, input.config, (items, at) => {
		if (inserted || containerZoneId(at) !== targetZone) return items;
		inserted = true;
		const clamped = Math.max(
			0,
			Math.min(input.index ?? items.length, items.length),
		);
		const node = {
			type: input.type,
			props: { ...(input.props ?? {}), id: input.nodeId },
		};
		return [...items.slice(0, clamped), node, ...items.slice(clamped)];
	});
	if (!inserted) {
		return rejected(input.data, unknownZone(targetZone));
	}
	return {
		data: next,
		status: "updated",
		createdNodeIds: [input.nodeId],
		errors: [],
	};
}

/** Input to {@link replaceNodePropsInData}. */
export interface ReplaceNodePropsInput {
	readonly data: Data;
	readonly config: Config;
	readonly nodeId: string;
	/** Pure prop edit, re-run against the node that actually reaches Puck. */
	readonly updateProps: (
		props: Readonly<Record<string, unknown>>,
		node: PuckTreeNode,
	) => Readonly<Record<string, unknown>>;
}

/** Replace one node's props without moving it or changing its type. */
export function replaceNodePropsInData(
	input: ReplaceNodePropsInput,
): UpdateTreeResult {
	let replaced = false;
	let changed = false;
	const next = transformContainers(input.data, input.config, (items) =>
		items.map((entry) => {
			if (
				replaced ||
				!isComponentNode(entry) ||
				readNodeId(entry) !== input.nodeId
			) {
				return entry;
			}
			replaced = true;
			const props = input.updateProps(entry.props, entry);
			if (props === entry.props) return entry;
			changed = true;
			return { ...entry, props };
		}),
	);
	if (!replaced) {
		return rejected(
			input.data,
			makeEditorError(
				"EDITOR_NODE_NOT_FOUND",
				`node "${input.nodeId}" does not exist in the current document`,
				{ nodeIds: [input.nodeId] },
			),
		);
	}
	return changed
		? { data: next, status: "updated", createdNodeIds: NO_IDS, errors: [] }
		: noop(input.data);
}

/** Dependencies of the tree commit helpers. */
export interface TreeCommitDeps extends WriterGateDep {
	readonly getPuckApi: () => PuckApi;
}

/** Outcome of a tree commit attempt. */
export interface TreeCommitResult {
	readonly status: "committed" | "noop" | "rejected";
	readonly createdNodeIds: readonly string[];
	readonly errors: readonly EditorError[];
}

/**
 * Ask Puck whether an operation is permitted on a node.
 *
 * A denial must **prevent** the operation, never be worked around — so
 * an explicit `false` rejects, and so does a resolver that throws
 * (review 0036 L-4). Only a genuinely absent opinion — no
 * `getPermissions`, or a node Puck cannot find — passes.
 *
 * KNOWN GAP: Puck resolves per-component permissions asynchronously into
 * `resolvedPermissions`, falling back to the global set until that
 * lands, and this reads whatever is cached at call time. A component
 * whose `resolvePermissions` would deny an operation can therefore be
 * permitted if resolution has not run yet. Closing it needs an async
 * commit path (`refreshPermissions` returns nothing to await), which is
 * a redesign rather than a fix; Puck's own delete affordances have the
 * same characteristic.
 */
function permits(
	api: PuckApi,
	item: unknown,
	permission: "delete" | "duplicate" | "drag" | "edit",
): boolean {
	const get = (api as { getPermissions?: unknown }).getPermissions;
	// No `getPermissions` at all, or a node Puck cannot find, is genuinely
	// "no opinion" — there is nothing to honour.
	if (typeof get !== "function") return true;
	if (item === undefined || item === null) return true;
	try {
		const permissions = (
			get as (input: { item: unknown }) => Record<string, unknown>
		).call(api, { item });
		return permissions?.[permission] !== false;
	} catch {
		// A THROWING permission resolver is not "no opinion" — it is an
		// unanswered question, and this file's own rule is that a denial
		// must prevent the operation. Failing open here meant a host whose
		// resolver threw silently got every guarded operation allowed
		// (review 0036 L-4). Refusing is recoverable — the author retries;
		// allowing a denied delete is not.
		return false;
	}
}

/** Ask Puck whether a component type may be inserted. */
function permitsInsert(api: PuckApi, type: string): boolean {
	const get = (api as { getPermissions?: unknown }).getPermissions;
	if (typeof get !== "function") return true;
	try {
		const permissions = (
			get as (input: { type: string }) => Record<string, unknown>
		).call(api, { type });
		return permissions?.insert !== false;
	} catch {
		return false;
	}
}

/**
 * The locked nodes among `nodeIds` (`p3-006`).
 *
 * `p3-005` deliberately left this unwired: nothing wrote
 * `editorAnnotations` then, so a lock check would have read `undefined`
 * for every node and passed everything — support that looks present and
 * isn't. Now that the carrier exists, a locked node cannot be moved or
 * deleted through this surface.
 */
function lockedAmong(data: Data, nodeIds: readonly string[]): string[] {
	return nodeIds.filter((id) => isNodeLocked(data, id));
}

/**
 * The error for a document carrying a component type the config does
 * not describe.
 *
 * Puck's `walkTree` refuses to recurse a slot whose child type is
 * unregistered, and `walkAppState` rejects the same document — so the
 * editor could not be rendering it. Surfacing it beats letting the
 * throw escape into a click handler.
 */
function walkFailure(error: unknown): EditorError {
	return makeEditorError(
		"EDITOR_CAPABILITY_UNSUPPORTED",
		`the document contains a component the config does not describe, so its tree cannot be walked: ${
			error instanceof Error ? error.message : String(error)
		}`,
	);
}

function commit(
	deps: TreeCommitDeps,
	run: (data: Data, config: Config, api: PuckApi) => UpdateTreeResult,
): TreeCommitResult {
	const gate = writerGateError(deps);
	if (gate !== null) {
		return { status: "rejected", createdNodeIds: NO_IDS, errors: [gate] };
	}
	const api = deps.getPuckApi();
	const config = api.config as Config;
	// A throw from `walkTree` (a component the config does not describe)
	// must not escape into a click handler, and must not take down Puck's
	// reducer on the retry either — so it is folded into a rejected
	// outcome the protocol understands.
	const attempt = dispatchOneIntent<UpdateTreeResult>(api, (data) => {
		try {
			return run(data, config, api);
		} catch (error) {
			return {
				data,
				status: "rejected",
				createdNodeIds: NO_IDS,
				errors: [walkFailure(error)],
			};
		}
	});
	if (!attempt.committed) {
		return {
			status: failureStatus(attempt.outcome),
			createdNodeIds: NO_IDS,
			errors: attempt.outcome.errors,
		};
	}
	// Ids come off the run that actually landed, not the speculative one.
	return {
		status: "committed",
		createdNodeIds: attempt.outcome.createdNodeIds,
		errors: [],
	};
}

function denied(nodeIds: readonly string[], what: string): TreeCommitResult {
	return {
		status: "rejected",
		createdNodeIds: NO_IDS,
		errors: [
			makeEditorError(
				"EDITOR_NODE_LOCKED",
				`${what} is not permitted for the current selection`,
				{ nodeIds: [...nodeIds] },
			),
		],
	};
}

/** A denial expressed as a pure transform outcome for retry handling. */
function deniedInData(
	data: Data,
	nodeIds: readonly string[],
	what: string,
): UpdateTreeResult {
	return {
		data,
		status: "rejected",
		createdNodeIds: NO_IDS,
		errors: denied(nodeIds, what).errors,
	};
}

/** Delete a whole selection as ONE history entry. */
export function commitDeleteNodes(
	deps: TreeCommitDeps,
	nodeIds: readonly string[],
): TreeCommitResult {
	return commit(deps, (data, config, api) => {
		const locked = lockedAmong(data, nodeIds);
		if (locked.length > 0) return deniedInData(data, locked, "delete");
		const locations = indexNodeLocations(data, config);
		const blocked = nodeIds.filter(
			(id) => !permits(api, locations.get(id)?.node, "delete"),
		);
		if (blocked.length > 0) return deniedInData(data, blocked, "delete");
		return deleteNodesInData(data, nodeIds, config);
	});
}

/** Duplicate a whole selection as ONE history entry. */
export function commitDuplicateNodes(
	deps: TreeCommitDeps,
	nodeIds: readonly string[],
): TreeCommitResult {
	const api = deps.getPuckApi();
	// A locked node may be duplicated (the COPY is not locked), but the
	// source must not be mutated — duplication does not mutate it, so
	// only the Puck-level permission applies here.
	const blocked = nodeIds.filter((id) => {
		let item: unknown;
		try {
			item = api.getItemById?.(id);
		} catch {
			return false;
		}
		return !permits(api, item, "duplicate");
	});
	if (blocked.length > 0) return denied(blocked, "duplicate");
	// ONE allocator for this intent, created OUTSIDE `run` (review 0036
	// M-1). `commit`'s functional updater re-runs `run` against a document
	// that moved between validation and the reducer; without a stable
	// allocator that retry mints different ids than the `createdNodeIds`
	// already returned here, and the caller selects a node that is not in
	// the committed document.
	const allocate = createStableIdAllocator();
	return commit(deps, (data, config) =>
		duplicateNodesInData(data, nodeIds, config, allocate),
	);
}

/** Reorder one node as ONE history entry. */
export function commitReorderNode(
	deps: TreeCommitDeps,
	input: Omit<ReorderNodeInput, "data" | "config">,
): TreeCommitResult {
	return commit(deps, (data, config, api) => {
		if (lockedAmong(data, [input.nodeId]).length > 0) {
			return deniedInData(data, [input.nodeId], "reorder");
		}
		const item = indexNodeLocations(data, config).get(input.nodeId)?.node;
		if (!permits(api, item, "drag")) {
			return deniedInData(data, [input.nodeId], "reorder");
		}
		return reorderNodeInData({ ...input, data, config });
	});
}

/** Insert a node as ONE history entry. */
export function commitInsertNode(
	deps: TreeCommitDeps,
	input: Omit<InsertNodeInput, "data" | "config">,
): TreeCommitResult {
	return commit(deps, (data, config, api) => {
		const target = parseZoneId(normalizeZone(input.zone));
		if (
			target.parentId !== "root" &&
			lockedAmong(data, [target.parentId]).length > 0
		) {
			return deniedInData(data, [target.parentId], "insert");
		}
		if (!permitsInsert(api, input.type)) {
			return deniedInData(data, [input.nodeId], "insert");
		}
		return insertNodeInData({ ...input, data, config });
	});
}

/** Replace one node's props as ONE history entry. */
export function commitReplaceNodeProps(
	deps: TreeCommitDeps,
	input: Omit<ReplaceNodePropsInput, "data" | "config">,
): TreeCommitResult {
	return commit(deps, (data, config, api) => {
		if (lockedAmong(data, [input.nodeId]).length > 0) {
			return deniedInData(data, [input.nodeId], "edit");
		}
		const item = indexNodeLocations(data, config).get(input.nodeId)?.node;
		if (!permits(api, item, "edit")) {
			return deniedInData(data, [input.nodeId], "edit");
		}
		return replaceNodePropsInData({ ...input, data, config });
	});
}
