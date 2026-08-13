/**
 * @file Regression coverage for review 0037 P2-4 — chrome tree writes
 * use the canonical protocol and re-check locks/permissions on retry.
 */

import type { Config, Data, PuckApi } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { commitInsertNode, commitReplaceNodeProps } from "../update-tree.js";

const config = {
	root: { fields: {} },
	components: {
		Section: { fields: { children: { type: "slot" } }, render: () => null },
		Text: { fields: { text: { type: "text" } }, render: () => null },
	},
} as unknown as Config;

function doc(locked = false): Data {
	return {
		root: {
			props: locked
				? { editorAnnotations: { "text-1": { locked: true } } }
				: {},
		},
		content: [{ type: "Text", props: { id: "text-1", text: "old" } }],
	} as unknown as Data;
}

describe("chrome tree commits (0037 P2-4)", () => {
	it("rejects prop replacement when the retry document newly locks the node", () => {
		const current = doc();
		const moved = doc(true);
		let reduced: Data | undefined;
		const api = {
			appState: { data: current },
			config,
			dispatch: (action: { data: (previous: Data) => Data }) => {
				reduced = action.data(moved);
			},
			getPermissions: () => ({ edit: true }),
		} as unknown as PuckApi;

		const result = commitReplaceNodeProps(
			{ getPuckApi: () => api },
			{
				nodeId: "text-1",
				updateProps: (props) => ({ ...props, text: "dropped" }),
			},
		);

		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_NODE_LOCKED");
		expect(reduced).toBe(moved);
	});

	it("rejects insert when Puck denies the component type", () => {
		const dispatches: unknown[] = [];
		const api = {
			appState: { data: doc() },
			config,
			dispatch: (action: unknown) => dispatches.push(action),
			getPermissions: ({ type }: { type?: string }) => ({
				insert: type !== "Text",
			}),
		} as unknown as PuckApi;

		const result = commitInsertNode(
			{ getPuckApi: () => api },
			{ type: "Text", nodeId: "text-2" },
		);

		expect(result.status).toBe("rejected");
		expect(dispatches).toHaveLength(0);
	});
});
