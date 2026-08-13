/**
 * @file Regression coverage for review 0037 P2-1 — wrap selection must
 * follow only a tree transform that actually committed, never the
 * speculative first run of the functional-updater protocol.
 */

import type { Config, Data, PuckApi } from "@puckeditor/core";
import { describe, expect, it, vi } from "vitest";
import { createStudioEditorBridge } from "../../bridge.js";
import { buildShortcutContext } from "../context.js";

const containerComponent = {
	fields: { children: { type: "slot" } },
	metadata: {
		anvilkit: {
			editor: {
				styleTargets: {},
				slots: { children: { layoutContainer: true } },
			},
		},
	},
	render: () => null,
};

const config = {
	root: { fields: {} },
	components: {
		Section: containerComponent,
		Text: { fields: {}, render: () => null },
	},
} as unknown as Config;

function documentWithTarget(): Data {
	return {
		root: { props: { title: "Home" } },
		content: [{ type: "Text", props: { id: "text-1" } }],
	} as unknown as Data;
}

function documentWithoutTarget(): Data {
	return {
		root: { props: { title: "Home" } },
		content: [],
	} as unknown as Data;
}

describe("wrapNodes — actual commit outcome (0037 P2-1)", () => {
	it("does not select the speculative container when the retry is a noop", async () => {
		const current = documentWithTarget();
		const moved = documentWithoutTarget();
		const dispatch = vi.fn((action: { data: (previous: Data) => Data }) =>
			action.data(moved),
		);
		const api = {
			appState: { data: current },
			config,
			dispatch,
		} as unknown as PuckApi;
		const select = vi.fn<(nodeId: string) => void>();
		const bridge = createStudioEditorBridge();
		bridge.getPuckApi = () => api;
		bridge.selection = { select } as unknown as NonNullable<
			typeof bridge.selection
		>;
		const shortcuts = buildShortcutContext(bridge, {
			getPuckApi: () => ({
				config,
				getParentById: () => null,
			}),
		});

		await shortcuts.wrapNodes(["text-1"]);

		// The action was dispatched because the snapshot could wrap. Its
		// live updater then observed `moved`, where the target was gone.
		expect(dispatch).toHaveBeenCalledOnce();
		expect(select).not.toHaveBeenCalled();
	});
});
