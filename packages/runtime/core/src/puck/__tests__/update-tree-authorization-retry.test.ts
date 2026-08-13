/**
 * @file Regression coverage for review 0037 P2-2 — delete/reorder
 * authorization must be derived again inside the functional updater.
 */

import type { Config, Data, PuckApi } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { indexNodeLocations } from "../../editor/tree/nodes.js";
import { commitDeleteNodes, commitReorderNode } from "../update-tree.js";

const config = {
	root: { fields: {} },
	components: {
		Section: { fields: {}, render: () => null },
		Text: { fields: {}, render: () => null },
	},
} as unknown as Config;

interface DocOptions {
	readonly locked?: boolean;
	readonly denyDelete?: boolean;
	readonly denyDrag?: boolean;
}

function doc(options: DocOptions = {}): Data {
	return {
		root: {
			props: {
				...(options.locked
					? { editorAnnotations: { "text-1": { locked: true } } }
					: {}),
			},
		},
		content: [
			{ type: "Section", props: { id: "section-1" } },
			{
				type: "Text",
				props: {
					id: "text-1",
					...(options.denyDelete ? { denyDelete: true } : {}),
					...(options.denyDrag ? { denyDrag: true } : {}),
				},
			},
		],
	} as unknown as Data;
}

function movingApi(first: Data, moved: Data) {
	let reduced: Data | undefined;
	const api = {
		appState: { data: first },
		config,
		dispatch: (action: { data: (previous: Data) => Data }) => {
			reduced = action.data(moved);
		},
		getPermissions: ({ item }: { item?: unknown } = {}) => {
			const props = (item as { props?: Record<string, unknown> } | undefined)
				?.props;
			return {
				delete: props?.denyDelete !== true,
				drag: props?.denyDrag !== true,
			};
		},
	} as unknown as PuckApi;
	return { api, reduced: () => reduced };
}

function ids(data: Data): readonly string[] {
	return [...indexNodeLocations(data, config).keys()];
}

describe("tree authorization — functional-updater retry (0037 P2-2)", () => {
	it("rejects delete when the retry document newly locks the node", () => {
		const moved = doc({ locked: true });
		const { api, reduced } = movingApi(doc(), moved);

		const result = commitDeleteNodes({ getPuckApi: () => api }, ["text-1"]);

		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_NODE_LOCKED");
		expect(reduced()).toBe(moved);
		expect(ids(reduced() as Data)).toEqual(["section-1", "text-1"]);
	});

	it("rejects delete when permissions forbid the newer node data", () => {
		const moved = doc({ denyDelete: true });
		const { api, reduced } = movingApi(doc(), moved);

		const result = commitDeleteNodes({ getPuckApi: () => api }, ["text-1"]);

		expect(result.status).toBe("rejected");
		expect(reduced()).toBe(moved);
		expect(ids(reduced() as Data)).toEqual(["section-1", "text-1"]);
	});

	it("rejects reorder when the retry document newly locks the node", () => {
		const moved = doc({ locked: true });
		const { api, reduced } = movingApi(doc(), moved);

		const result = commitReorderNode(
			{ getPuckApi: () => api },
			{ nodeId: "text-1", toIndex: 0 },
		);

		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_NODE_LOCKED");
		expect(reduced()).toBe(moved);
		expect(ids(reduced() as Data)).toEqual(["section-1", "text-1"]);
	});

	it("rejects reorder when permissions forbid the newer node data", () => {
		const moved = doc({ denyDrag: true });
		const { api, reduced } = movingApi(doc(), moved);

		const result = commitReorderNode(
			{ getPuckApi: () => api },
			{ nodeId: "text-1", toIndex: 0 },
		);

		expect(result.status).toBe("rejected");
		expect(reduced()).toBe(moved);
		expect(ids(reduced() as Data)).toEqual(["section-1", "text-1"]);
	});
});
