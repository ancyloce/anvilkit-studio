/**
 * @file CORE-P1A-016 / CORE-P1B-013 regression — native tree ops must
 * see children that live in ROOT SLOT props (`root.props.<slot>`),
 * not just `content`/`zones`. Puck 0.22 slot documents put top-level
 * children there, and the browser surfaced every bulk op (duplicate,
 * delete, wrap) silently no-oping on such documents.
 */

import type { Config } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { duplicateNode, removeNode } from "../native-tree.js";

/**
 * Slot identity comes from the config, not from the value shape
 * (review 0036 M-6), so these documents need one. `root.children` is
 * the root slot under test; every type the slot holds must be
 * registered or Puck's `walkTree` refuses to recurse it.
 */
const config = {
	root: { fields: { children: { type: "slot" } } },
	components: {
		Navbar: { fields: {}, render: () => null },
		Hero: { fields: {}, render: () => null },
	},
} as unknown as Config;

/** The root slot's children, whatever the document shape. */
function rootChildren(data: unknown): readonly { props: { id: string } }[] {
	const props = (data as { root?: { props?: Record<string, unknown> } }).root
		?.props;
	return (props?.["children"] ?? []) as readonly { props: { id: string } }[];
}

function rootSlotData() {
	return {
		root: {
			props: {
				title: "Home",
				children: [
					{ type: "Navbar", props: { id: "navbar-1" } },
					{ type: "Hero", props: { id: "hero-1", headline: "x" } },
				],
			},
		},
		content: [],
	} as never;
}

describe("native tree ops over root slot props", () => {
	it("duplicates a node held in a root slot", () => {
		const result = duplicateNode(rootSlotData(), "hero-1", config);
		if (result === null) {
			throw new Error("expected a duplicate result");
		}
		const children = rootChildren(result.data);
		expect(children).toHaveLength(3);
		expect(children[2]?.props.id).toBe(result.newRootId);
		expect(children[1]?.props.id).toBe("hero-1");
	});

	it("removes a node held in a root slot", () => {
		const next = removeNode(rootSlotData(), "navbar-1", config);
		if (next === null) {
			throw new Error("expected a removal result");
		}
		const children = rootChildren(next);
		expect(children).toHaveLength(1);
		expect(children[0]?.props.id).toBe("hero-1");
	});

	it("leaves documents without root slots untouched by reference", () => {
		const data = {
			root: { props: { title: "Home" } },
			content: [{ type: "Hero", props: { id: "hero-1" } }],
		} as never;
		const result = duplicateNode(data, "hero-1", config);
		if (result === null) {
			throw new Error("expected a duplicate result");
		}
		expect(result.data.root).toBe((data as { root: unknown }).root);
	});
});
