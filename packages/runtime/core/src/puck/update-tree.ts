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
 * ## The zone trap
 *
 * Puck's root zone is **`"root:default-zone"`**. A dispatch using the
 * bare `"default-zone"` silently targets nothing — it does not throw,
 * it just does not apply, which is the worst possible failure mode for
 * a tree edit. Every entry point here normalizes through
 * {@link normalizeZone} rather than trusting its caller.
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
 * The subtree transforms come from `react/editor/native-tree.ts`,
 * which is carrier-agnostic (it takes `Data` and nothing else) and is
 * not on `p3-009`'s delete list. Duplication remaps **node** ids only;
 * the component-instance link references a `definitionId` and
 * definition-node ids, neither of which are page node ids — so a
 * duplicated instance stays an instance of the same definition rather
 * than silently becoming a detached copy.
 */

import type { EditorError } from "@anvilkit/contracts/editor";
import type { Data, PuckApi } from "@puckeditor/core";
import { makeEditorError } from "../editor/diagnostics.js";
import { isNodeLocked } from "./update-annotations.js";
import { duplicateNode, removeNode } from "../react/editor/native-tree.js";
import { type WriterGateDep, writerGateError } from "./writer-gate.js";

/** Puck's root zone, in the only form `dispatch` honours. */
export const ROOT_ZONE = "root:default-zone";

/**
 * Normalize a zone id to the form Puck's reducer matches.
 *
 * A bare `"default-zone"` (or an omitted zone) becomes
 * {@link ROOT_ZONE}. Slot zones (`"<nodeId>:<slotName>"`) already carry
 * their owner and pass through unchanged.
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

/**
 * Delete every node in a selection, in ONE document update.
 *
 * Unknown ids are skipped rather than failing the whole operation —
 * a selection can go stale between render and click, and refusing the
 * other two deletions because one id vanished would be worse than
 * doing what the user asked for the ids that still exist.
 */
export function deleteNodesInData(
	data: Data,
	nodeIds: readonly string[],
): UpdateTreeResult {
	let next = data;
	let changed = false;
	for (const nodeId of nodeIds) {
		const removed = removeNode(next as never, nodeId);
		if (removed === null) continue;
		next = removed as unknown as Data;
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
 */
export function duplicateNodesInData(
	data: Data,
	nodeIds: readonly string[],
): UpdateTreeResult {
	let next = data;
	const createdNodeIds: string[] = [];
	for (const nodeId of nodeIds) {
		const copied = duplicateNode(next as never, nodeId);
		if (copied === null) continue;
		next = copied.data as unknown as Data;
		createdNodeIds.push(copied.newRootId);
	}
	return createdNodeIds.length > 0
		? { data: next, status: "updated", createdNodeIds, errors: [] }
		: noop(data);
}

/** Input to {@link reorderNodeInData}. */
export interface ReorderNodeInput {
	readonly data: Data;
	readonly nodeId: string;
	/** Destination zone; normalized, so a bare name is accepted. */
	readonly zone?: string;
	readonly toIndex: number;
}

function zoneEntries(data: Data): Record<string, unknown[]> {
	const zones = (data as { zones?: Record<string, unknown[]> }).zones ?? {};
	return {
		[ROOT_ZONE]: [...((data.content ?? []) as unknown[])],
		...Object.fromEntries(
			Object.entries(zones).map(([key, value]) => [key, [...value]]),
		),
	};
}

function withZones(data: Data, zones: Record<string, unknown[]>): Data {
	const { [ROOT_ZONE]: root, ...rest } = zones;
	return {
		...data,
		content: (root ?? []) as Data["content"],
		zones: rest as Data["zones"],
	} as Data;
}

/**
 * Move a node to a new index within a zone (or into another zone).
 *
 * Reordering across zones is a remove-then-insert on the same document,
 * so it stays one update and therefore one history entry.
 */
export function reorderNodeInData(input: ReorderNodeInput): UpdateTreeResult {
	const zone = normalizeZone(input.zone);
	const zones = zoneEntries(input.data);
	let moved: unknown;
	for (const [key, items] of Object.entries(zones)) {
		const index = items.findIndex(
			(item) =>
				(item as { props?: { id?: unknown } }).props?.id === input.nodeId,
		);
		if (index === -1) continue;
		moved = items[index];
		items.splice(index, 1);
		zones[key] = items;
		break;
	}
	if (moved === undefined) {
		return {
			data: input.data,
			status: "rejected",
			createdNodeIds: NO_IDS,
			errors: [
				makeEditorError(
					"EDITOR_NODE_NOT_FOUND",
					`node "${input.nodeId}" is not in the document`,
					{ details: { nodeId: input.nodeId } },
				),
			],
		};
	}
	const target = zones[zone] ?? [];
	const clamped = Math.max(0, Math.min(input.toIndex, target.length));
	target.splice(clamped, 0, moved);
	zones[zone] = target;
	return {
		data: withZones(input.data, zones),
		status: "updated",
		createdNodeIds: NO_IDS,
		errors: [],
	};
}

/** Input to {@link insertNodeInData}. */
export interface InsertNodeInput {
	readonly data: Data;
	readonly type: string;
	/** Caller-generated id — never derived here. */
	readonly nodeId: string;
	readonly zone?: string;
	readonly index?: number;
	readonly props?: Readonly<Record<string, unknown>>;
}

/** Insert a new node into a zone at an index. */
export function insertNodeInData(input: InsertNodeInput): UpdateTreeResult {
	const zone = normalizeZone(input.zone);
	const zones = zoneEntries(input.data);
	const target = zones[zone] ?? [];
	const clamped = Math.max(
		0,
		Math.min(input.index ?? target.length, target.length),
	);
	target.splice(clamped, 0, {
		type: input.type,
		props: { ...(input.props ?? {}), id: input.nodeId },
	});
	zones[zone] = target;
	return {
		data: withZones(input.data, zones),
		status: "updated",
		createdNodeIds: [input.nodeId],
		errors: [],
	};
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
 * A denial must **prevent** the operation, never be worked around —
 * so an explicit `false` rejects. An API without `getPermissions`, or
 * one that throws mid-transition, is treated as "no opinion" rather
 * than as a denial, matching how the rest of the editor treats
 * advisory Puck lookups during render.
 */
function permits(
	api: PuckApi,
	nodeId: string,
	permission: "delete" | "duplicate" | "drag",
): boolean {
	const get = (api as { getPermissions?: unknown }).getPermissions;
	if (typeof get !== "function") return true;
	try {
		const item = api.getItemById?.(nodeId);
		if (item === undefined || item === null) return true;
		const permissions = (
			get as (input: { item: unknown }) => Record<string, unknown>
		).call(api, { item });
		return permissions?.[permission] !== false;
	} catch {
		return true;
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
function lockedAmong(api: PuckApi, nodeIds: readonly string[]): string[] {
	const data = api.appState.data as Data;
	return nodeIds.filter((id) => isNodeLocked(data, id));
}

function commit(
	deps: TreeCommitDeps,
	run: (data: Data) => UpdateTreeResult,
): TreeCommitResult {
	const gate = writerGateError(deps);
	if (gate !== null) {
		return { status: "rejected", createdNodeIds: NO_IDS,  errors: [gate] };
	}
	const api = deps.getPuckApi();
	const current = api.appState.data as Data;
	const result = run(current);
	if (result.status !== "updated") {
		return {
			status: result.status === "noop" ? "noop" : "rejected",
			createdNodeIds: NO_IDS,
			errors: result.errors,
		};
	}
	api.dispatch({
		type: "setData",
		recordHistory: true,
		data: (previous: Data) =>
			previous === current ? result.data : run(previous).data,
	} as Parameters<PuckApi["dispatch"]>[0]);
	return {
		status: "committed",
		createdNodeIds: result.createdNodeIds,
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

/** Delete a whole selection as ONE history entry. */
export function commitDeleteNodes(
	deps: TreeCommitDeps,
	nodeIds: readonly string[],
): TreeCommitResult {
	const api = deps.getPuckApi();
	const locked = lockedAmong(api, nodeIds);
	if (locked.length > 0) return denied(locked, "delete");
	const blocked = nodeIds.filter((id) => !permits(api, id, "delete"));
	if (blocked.length > 0) return denied(blocked, "delete");
	return commit(deps, (data) => deleteNodesInData(data, nodeIds));
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
	const blocked = nodeIds.filter((id) => !permits(api, id, "duplicate"));
	if (blocked.length > 0) return denied(blocked, "duplicate");
	return commit(deps, (data) => duplicateNodesInData(data, nodeIds));
}

/** Reorder one node as ONE history entry. */
export function commitReorderNode(
	deps: TreeCommitDeps,
	input: Omit<ReorderNodeInput, "data">,
): TreeCommitResult {
	const api = deps.getPuckApi();
	if (lockedAmong(api, [input.nodeId]).length > 0) {
		return denied([input.nodeId], "reorder");
	}
	if (!permits(api, input.nodeId, "drag")) {
		return denied([input.nodeId], "reorder");
	}
	return commit(deps, (data) => reorderNodeInData({ ...input, data }));
}

/** Insert a node as ONE history entry. */
export function commitInsertNode(
	deps: TreeCommitDeps,
	input: Omit<InsertNodeInput, "data">,
): TreeCommitResult {
	return commit(deps, (data) => insertNodeInData({ ...input, data }));
}
