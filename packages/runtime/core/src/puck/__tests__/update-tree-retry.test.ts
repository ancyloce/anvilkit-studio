/**
 * @file Regression tests for review 0036 M-1 — a commit's retry must
 * reproduce the ids it already reported.
 *
 * Every commit helper dispatches a functional updater shaped
 * `previous === current ? result.data : run(previous).data`, so that a
 * document which moved between validation and the reducer is re-derived
 * rather than clobbered. That is only sound while `run` is
 * deterministic.
 *
 * Duplication was not: `generateNodeId` is a random UUID, so the retry
 * minted a different set of ids than the `createdNodeIds` already
 * returned to the caller — which then selected a node that was not in
 * the committed document. `wrapNode` had the identical defect through
 * `commitTree`, where the container id the selection follows came from
 * the first run.
 *
 * The fix is one stable, source-keyed id allocator created per intent,
 * OUTSIDE the `run` closure.
 */

import type { Config, Data, PuckApi } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { indexNodeLocations } from "../../editor/tree/nodes.js";
import {
	createStableIdAllocator,
	wrapNode,
} from "../../editor/tree/transforms.js";
import {
	commitDeleteNodes,
	commitDuplicateNodes,
	duplicateNodesInData,
} from "../update-tree.js";

const config = {
	root: { fields: {} },
	components: {
		Section: { fields: { content: { type: "slot" } }, render: () => null },
		Text: { fields: {}, render: () => null },
	},
} as unknown as Config;

/** A section with a nested child, so a copy allocates several ids. */
function doc(): Data {
	return {
		root: { props: { title: "Home" } },
		content: [
			{
				type: "Section",
				props: {
					id: "sec-1",
					content: [{ type: "Text", props: { id: "t-inner" } }],
				},
			},
			{ type: "Text", props: { id: "t-2" } },
		],
	} as unknown as Data;
}

/** Every node id present in a document. */
function allIds(data: Data): string[] {
	return [...indexNodeLocations(data, config).keys()];
}

/** Run the functional updater synchronously, as the public Puck API does. */
function commitAndCapture(
	nodeIds: readonly string[],
	previous: "snapshot" | "moved" = "moved",
) {
	const current = doc();
	let committed: Data | undefined;
	const api = {
		appState: { data: current },
		config,
		dispatch: (action: { data: (previous: Data) => Data }) => {
			committed = action.data(previous === "snapshot" ? current : doc());
		},
	} as unknown as PuckApi;

	const result = commitDuplicateNodes({ getPuckApi: () => api }, nodeIds);
	if (committed === undefined) {
		throw new Error("expected the functional updater to run");
	}
	return { result, committed };
}

describe("commitDuplicateNodes — retry reproduces the reported ids (0036 M-1)", () => {
	it("commits the ids it returned even when the document moved", () => {
		const { result, committed } = commitAndCapture(["sec-1"]);
		expect(result.status).toBe("committed");
		const reported = result.createdNodeIds[0];
		expect(reported).toBeDefined();

		// A concurrent write landed between validation and the reducer: the
		// updater receives a DIFFERENT document object, so it takes the
		// re-run branch.
		// Before the fix the retry minted a fresh UUID here, so the id the
		// caller had already been handed — and selects — was absent.
		expect(allIds(committed)).toContain(reported as string);
	});

	it("takes the fast path unchanged when the document did not move", () => {
		const { result, committed } = commitAndCapture(["sec-1"], "snapshot");
		expect(allIds(committed)).toContain(result.createdNodeIds[0] as string);
	});

	it("reproduces ids for a whole multi-node selection", () => {
		const { result, committed } = commitAndCapture(["sec-1", "t-2"]);
		expect(result.createdNodeIds).toHaveLength(2);
		const committedIds = allIds(committed);
		for (const id of result.createdNodeIds) {
			expect(committedIds).toContain(id);
		}
	});
});

describe("commitDeleteNodes — honest outcome on conflict (0036 M-2)", () => {
	/**
	 * A real Puck-style API snapshot whose store moves while the action is
	 * reduced. `appState` stays fixed on `first`; the functional updater is
	 * where Puck supplies the live `moved` document (review 0037 P1-1).
	 */
	function movingApi(first: Data, moved: Data) {
		const dispatched: unknown[] = [];
		const api = {
			appState: { data: first },
			config,
			dispatch: (action: { data: (previous: Data) => Data }) => {
				dispatched.push(action);
				action.data(moved);
			},
		} as unknown as PuckApi;
		return { api, dispatched };
	}

	it("rejects when the reducer receives a document where the node is gone", () => {
		// The author deletes `t-2`; a collaborator's write lands first and
		// has already removed it. Re-deriving applies the same strict missing-
		// target policy as carrier and create-component writes.
		const withNode = doc();
		const withoutNode = {
			root: { props: { title: "Home" } },
			content: [
				{
					type: "Section",
					props: {
						id: "sec-1",
						content: [{ type: "Text", props: { id: "t-inner" } }],
					},
				},
			],
		} as unknown as Data;

		const { api, dispatched } = movingApi(withNode, withoutNode);
		const result = commitDeleteNodes({ getPuckApi: () => api }, ["t-2"]);

		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_NODE_NOT_FOUND");
		expect(dispatched).toHaveLength(1);
	});

	it("still commits when the re-derived intent does apply", () => {
		const { api, dispatched } = movingApi(doc(), doc());
		const result = commitDeleteNodes({ getPuckApi: () => api }, ["t-2"]);
		expect(result.status).toBe("committed");
		expect(dispatched).toHaveLength(1);
	});
});

describe("createStableIdAllocator", () => {
	it("makes duplication reproducible across runs", () => {
		const allocate = createStableIdAllocator();
		const a = duplicateNodesInData(doc(), ["sec-1"], config, allocate);
		const b = duplicateNodesInData(doc(), ["sec-1"], config, allocate);
		expect(a.createdNodeIds).toEqual(b.createdNodeIds);
		// The nested child is remapped too, so the whole copied subtree is
		// reproducible — not just its root.
		expect(allIds(a.data)).toEqual(allIds(b.data));
	});

	it("still yields fresh ids per run without one (the default)", () => {
		const a = duplicateNodesInData(doc(), ["sec-1"], config);
		const b = duplicateNodesInData(doc(), ["sec-1"], config);
		expect(a.createdNodeIds).not.toEqual(b.createdNodeIds);
	});

	it("gives a different id to a different source node", () => {
		const allocate = createStableIdAllocator();
		expect(allocate("Text", "a")).not.toBe(allocate("Text", "b"));
		expect(allocate("Text", "a")).toBe(allocate("Text", "a"));
	});

	it("does not memoize a node that has no id of its own", () => {
		// Such a node can never reach `idMap`, so it is never reported —
		// memoizing it would only risk colliding two anonymous nodes.
		const allocate = createStableIdAllocator();
		expect(allocate("Text", undefined)).not.toBe(allocate("Text", undefined));
	});
});

describe("wrapNode — retry reproduces the container id (0036 M-1)", () => {
	it("returns the same container across repeated runs with one allocator", () => {
		const allocate = createStableIdAllocator();
		const first = wrapNode(
			doc(),
			"t-2",
			"Section",
			"content",
			config,
			allocate,
		);
		const second = wrapNode(
			doc(),
			"t-2",
			"Section",
			"content",
			config,
			allocate,
		);
		expect(first?.containerId).toBeDefined();
		expect(first?.containerId).toBe(second?.containerId);
	});

	it("still yields a fresh container id without one (the default)", () => {
		const first = wrapNode(doc(), "t-2", "Section", "content", config);
		const second = wrapNode(doc(), "t-2", "Section", "content", config);
		expect(first?.containerId).not.toBe(second?.containerId);
	});
});
