/**
 * @file Regression tests for review 0036 H-2 and M-6 — tree writes must
 * address Puck SLOTS, and slot identity must come from the config.
 *
 * `update-tree.ts` used to enumerate containers as "`data.content` plus
 * `data.zones`". In `@puckeditor/core@0.23.0` slot children live in
 * `props.<slot>`; `data.zones` is the legacy DropZone map that Puck's
 * `migrate()` exists to drain and throws on. So insert-into-a-slot
 * produced a node no renderer would ever show, and reorder-of-a-node-
 * in-a-slot reported `EDITOR_NODE_NOT_FOUND` for a node plainly in the
 * document (H-2).
 *
 * Slots were also recognised by value shape
 * (`Array.isArray(v) && v.some(isComponentNode)`), so an empty or
 * absent slot was invisible to every walk and could not be inserted
 * into at all (M-6).
 *
 * This file did not exist before — none of these functions had any test
 * coverage despite being exported from `@anvilkit/core/editor`.
 */

import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
	deleteNodesInData,
	duplicateNodesInData,
	insertNodeInData,
	normalizeZone,
	ROOT_ZONE,
	reorderNodeInData,
} from "../update-tree.js";

const config = {
	root: { fields: { children: { type: "slot" } } },
	components: {
		Section: { fields: { content: { type: "slot" } }, render: () => null },
		Text: { fields: { text: { type: "text" } }, render: () => null },
	},
} as unknown as Config;

/** A section holding one text node, beside a sibling text node. */
function doc(sectionProps: Record<string, unknown> = {}): Data {
	return {
		root: { props: { title: "Home" } },
		content: [
			{
				type: "Section",
				props: {
					id: "sec-1",
					content: [{ type: "Text", props: { id: "t-1" } }],
					...sectionProps,
				},
			},
			{ type: "Text", props: { id: "t-2" } },
		],
	} as unknown as Data;
}

/** The children of `sec-1`'s declared slot. */
function slotOf(data: Data): readonly { props: { id: string } }[] {
	const section = (
		data.content as readonly { props: Record<string, unknown> }[]
	)
		.map((node) => node.props)
		.find((props) => props.id === "sec-1");
	return (section?.content ?? []) as readonly { props: { id: string } }[];
}

function ids(nodes: readonly { props: { id: string } }[]): string[] {
	return nodes.map((node) => node.props.id);
}

/** The legacy zone map, which nothing may write to any more. */
function legacyZones(data: Data): Record<string, unknown> {
	return ((data as { zones?: Record<string, unknown> }).zones ?? {}) as Record<
		string,
		unknown
	>;
}

describe("normalizeZone", () => {
	it("maps the bare and omitted forms onto Puck's root zone", () => {
		expect(normalizeZone(undefined)).toBe(ROOT_ZONE);
		expect(normalizeZone("")).toBe(ROOT_ZONE);
		expect(normalizeZone("default-zone")).toBe(ROOT_ZONE);
	});

	it("passes a slot zone through unchanged", () => {
		expect(normalizeZone("sec-1:content")).toBe("sec-1:content");
	});
});

describe("multi-node intents — missing target policy", () => {
	it.each([
		["delete", deleteNodesInData],
		["duplicate", duplicateNodesInData],
	] as const)(
		"rejects an atomic %s when any selected node is missing",
		(_, run) => {
			const source = doc();
			const result = run(source, ["t-2", "missing"], config);
			expect(result.status).toBe("rejected");
			expect(result.data).toBe(source);
			expect(result.errors[0]).toMatchObject({
				code: "EDITOR_NODE_NOT_FOUND",
				nodeIds: ["missing"],
			});
		},
	);
});

describe("insertNodeInData — slot addressing (0036 H-2)", () => {
	it("preserves every untouched sibling and descendant reference", () => {
		const source = doc();
		const section = source.content[0];
		const topLevelSibling = source.content[1];
		const nestedSibling = (
			section as { props: { content: readonly unknown[] } }
		).props.content[0];

		const result = insertNodeInData({
			data: source,
			config,
			type: "Text",
			nodeId: "new-1",
			zone: "sec-1:content",
		});

		expect(result.status).toBe("updated");
		expect(result.data.content[0]).not.toBe(section);
		expect(result.data.content[1]).toBe(topLevelSibling);
		expect(slotOf(result.data)[0]).toBe(nestedSibling);
	});

	it("inserts into the owner's slot prop, not the legacy zone map", () => {
		const result = insertNodeInData({
			data: doc(),
			config,
			type: "Text",
			nodeId: "new-1",
			zone: "sec-1:content",
			index: 0,
		});

		expect(result.status).toBe("updated");
		expect(ids(slotOf(result.data))).toEqual(["new-1", "t-1"]);
		// The whole bug: this used to be where the node landed, and a
		// slot-field container never renders it.
		expect(legacyZones(result.data)["sec-1:content"]).toBeUndefined();
	});

	it("appends to the slot when no index is given", () => {
		const result = insertNodeInData({
			data: doc(),
			config,
			type: "Text",
			nodeId: "new-1",
			zone: "sec-1:content",
		});
		expect(ids(slotOf(result.data))).toEqual(["t-1", "new-1"]);
	});

	it("still inserts into top-level content", () => {
		const result = insertNodeInData({
			data: doc(),
			config,
			type: "Text",
			nodeId: "new-1",
			index: 1,
		});
		expect(result.status).toBe("updated");
		expect(
			(result.data.content as readonly { props: { id: string } }[]).map(
				(node) => node.props.id,
			),
		).toEqual(["sec-1", "new-1", "t-2"]);
	});

	it("rejects a zone that resolves to nothing instead of conjuring it", () => {
		const result = insertNodeInData({
			data: doc(),
			config,
			type: "Text",
			nodeId: "new-1",
			zone: "does-not-exist:content",
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_NODE_NOT_FOUND");
		// Nothing was written anywhere.
		expect(legacyZones(result.data)["does-not-exist:content"]).toBeUndefined();
	});

	it("rejects a prop that is not a declared slot", () => {
		// `text` is a text field, not a slot — writing children there would
		// corrupt the node.
		const result = insertNodeInData({
			data: doc(),
			config,
			type: "Text",
			nodeId: "new-1",
			zone: "t-2:text",
		});
		expect(result.status).toBe("rejected");
	});
});

describe("insertNodeInData — empty and absent slots (0036 M-6)", () => {
	it("inserts into a slot that is currently empty", () => {
		const result = insertNodeInData({
			data: doc({ content: [] }),
			config,
			type: "Text",
			nodeId: "new-1",
			zone: "sec-1:content",
		});
		expect(result.status).toBe("updated");
		expect(ids(slotOf(result.data))).toEqual(["new-1"]);
	});

	it("inserts into a declared slot that is absent from props", () => {
		// The config declares `content`; the document simply has not
		// materialised it yet. Value-shape detection could never see this.
		const bare = {
			root: { props: { title: "Home" } },
			content: [{ type: "Section", props: { id: "sec-1" } }],
		} as unknown as Data;

		const result = insertNodeInData({
			data: bare,
			config,
			type: "Text",
			nodeId: "new-1",
			zone: "sec-1:content",
		});
		expect(result.status).toBe("updated");
		expect(ids(slotOf(result.data))).toEqual(["new-1"]);
	});

	it("inserts into an empty ROOT slot", () => {
		const rootSlotDoc = {
			root: { props: { title: "Home", children: [] } },
			content: [],
		} as unknown as Data;

		const result = insertNodeInData({
			data: rootSlotDoc,
			config,
			type: "Text",
			nodeId: "new-1",
			zone: "root:children",
		});
		expect(result.status).toBe("updated");
		const children = (result.data.root as { props: Record<string, unknown> })
			.props.children as readonly { props: { id: string } }[];
		expect(ids(children)).toEqual(["new-1"]);
	});
});

describe("reorderNodeInData — slot addressing (0036 H-2)", () => {
	it("finds and moves a node that lives in a slot", () => {
		const source = doc({
			content: [
				{ type: "Text", props: { id: "t-1" } },
				{ type: "Text", props: { id: "t-3" } },
			],
		});

		const result = reorderNodeInData({
			data: source,
			config,
			nodeId: "t-3",
			zone: "sec-1:content",
			toIndex: 0,
		});

		// Before the fix this rejected with EDITOR_NODE_NOT_FOUND, because
		// the node was in `props.content` and the walk only read
		// `data.content` + `data.zones`.
		expect(result.status).toBe("updated");
		expect(ids(slotOf(result.data))).toEqual(["t-3", "t-1"]);
	});

	it("moves a node out of a slot into top-level content", () => {
		const result = reorderNodeInData({
			data: doc(),
			config,
			nodeId: "t-1",
			zone: ROOT_ZONE,
			toIndex: 0,
		});

		expect(result.status).toBe("updated");
		expect(ids(slotOf(result.data))).toEqual([]);
		expect(
			(result.data.content as readonly { props: { id: string } }[]).map(
				(node) => node.props.id,
			),
		).toEqual(["t-1", "sec-1", "t-2"]);
	});

	it("moves a node from top-level content into a slot", () => {
		const result = reorderNodeInData({
			data: doc(),
			config,
			nodeId: "t-2",
			zone: "sec-1:content",
			toIndex: 0,
		});

		expect(result.status).toBe("updated");
		expect(ids(slotOf(result.data))).toEqual(["t-2", "t-1"]);
		expect(
			(result.data.content as readonly { props: { id: string } }[]).map(
				(node) => node.props.id,
			),
		).toEqual(["sec-1"]);
	});

	it("rejects an unknown node", () => {
		const result = reorderNodeInData({
			data: doc(),
			config,
			nodeId: "nope",
			toIndex: 0,
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_NODE_NOT_FOUND");
	});

	it("refuses to move a node into its own subtree", () => {
		const result = reorderNodeInData({
			data: doc(),
			config,
			nodeId: "sec-1",
			zone: "sec-1:content",
			toIndex: 0,
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_COMPONENT_CYCLE");
	});
});
