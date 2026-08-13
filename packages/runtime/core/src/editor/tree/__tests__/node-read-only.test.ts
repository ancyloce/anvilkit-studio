/**
 * @file Regression tests for review 0036 M-4 — tree rebuilds must not
 * strip Puck's per-node `readOnly` state.
 *
 * Puck's node type is `{ type; props } & BaseData`, where `BaseData` is
 * `{ readOnly?: Partial<Record<keyof Props, boolean>> }` — how Puck
 * marks individual fields non-editable, typically computed by a
 * component's `resolveData`. Three places reconstructed nodes as
 * exactly `{ type, props }` and silently dropped it: the value-shape
 * walk's `mapNode`, `cloneSubtree`, and `setNodeProp`. Because
 * `setData` runs `walkAppState` but not `resolveData`, the loss
 * persisted until the next resolve pass — a field the component said
 * was locked quietly became editable.
 *
 * M-4 had no test, which is why it survived. These pin the property
 * across every mutation surface: the `walkTree`-based ops, the clone
 * path, and the direct prop write.
 */

import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
	deleteNodesInData,
	duplicateNodesInData,
	insertNodeInData,
	ROOT_ZONE,
	reorderNodeInData,
} from "../../../puck/update-tree.js";
import { setNodeProp } from "../transforms.js";

const config = {
	root: { fields: {} },
	components: {
		Section: { fields: { content: { type: "slot" } }, render: () => null },
		Text: { fields: { label: { type: "text" } }, render: () => null },
	},
} as unknown as Config;

/**
 * `t-1` sits inside a slot and `t-2` at top level; both carry a
 * `readOnly` map, so an operation on either one exercises both the
 * "rebuilt" and the "untouched sibling" paths.
 */
function doc(): Data {
	return {
		root: { props: { title: "Home" } },
		content: [
			{
				type: "Section",
				props: {
					id: "sec-1",
					content: [
						{
							type: "Text",
							props: { id: "t-1", label: "inner" },
							readOnly: { label: true },
						},
					],
				},
				readOnly: { content: true },
			},
			{
				type: "Text",
				props: { id: "t-2", label: "outer" },
				readOnly: { label: true },
			},
		],
	} as unknown as Data;
}

type Node = {
	type: string;
	props: Record<string, unknown>;
	readOnly?: unknown;
};

/** Every node in the document, flattened, by id. */
function nodesById(data: Data): Map<string, Node> {
	const found = new Map<string, Node>();
	const visit = (items: readonly unknown[]): void => {
		for (const entry of items) {
			const node = entry as Node;
			if (typeof node?.type !== "string") continue;
			const id = node.props?.id;
			if (typeof id === "string") found.set(id, node);
			for (const value of Object.values(node.props ?? {})) {
				if (Array.isArray(value)) visit(value);
			}
		}
	};
	visit(data.content as readonly unknown[]);
	return found;
}

function readOnlyOf(data: Data, id: string): unknown {
	return nodesById(data).get(id)?.readOnly;
}

describe("readOnly survives tree mutations (0036 M-4)", () => {
	it("survives an insert elsewhere in the document", () => {
		const result = insertNodeInData({
			data: doc(),
			config,
			type: "Text",
			nodeId: "new-1",
			zone: ROOT_ZONE,
		});
		expect(result.status).toBe("updated");
		expect(readOnlyOf(result.data, "t-2")).toEqual({ label: true });
		// The slot child is rebuilt by the walk on its way past.
		expect(readOnlyOf(result.data, "t-1")).toEqual({ label: true });
		expect(readOnlyOf(result.data, "sec-1")).toEqual({ content: true });
	});

	it("survives a reorder that moves a node between containers", () => {
		const result = reorderNodeInData({
			data: doc(),
			config,
			nodeId: "t-1",
			zone: ROOT_ZONE,
			toIndex: 0,
		});
		expect(result.status).toBe("updated");
		// The MOVED node keeps its own lock...
		expect(readOnlyOf(result.data, "t-1")).toEqual({ label: true });
		// ...and so do the nodes it moved past.
		expect(readOnlyOf(result.data, "t-2")).toEqual({ label: true });
	});

	it("survives a delete of an unrelated node", () => {
		const result = deleteNodesInData(doc(), ["t-2"], config);
		expect(result.status).toBe("updated");
		expect(readOnlyOf(result.data, "t-1")).toEqual({ label: true });
		expect(readOnlyOf(result.data, "sec-1")).toEqual({ content: true });
	});

	it("is carried onto a duplicated subtree", () => {
		const result = duplicateNodesInData(doc(), ["sec-1"], config);
		expect(result.status).toBe("updated");
		const copyId = result.createdNodeIds[0] as string;
		const nodes = nodesById(result.data);

		// The copy of the container...
		expect(nodes.get(copyId)?.readOnly).toEqual({ content: true });
		// ...and the copy of its slot child, whose id was remapped. The copy
		// is the one node `cloneSubtree` rebuilds from scratch, so it is the
		// most direct witness for this finding.
		const copiedChild = [...nodes.values()].find(
			(node) =>
				node.type === "Text" &&
				node.props.label === "inner" &&
				node.props.id !== "t-1",
		);
		expect(copiedChild?.readOnly).toEqual({ label: true });
		// The original is untouched.
		expect(readOnlyOf(result.data, "t-1")).toEqual({ label: true });
	});

	it("survives a direct prop write on the edited node", () => {
		const next = setNodeProp(doc(), "t-2", ["label"], "edited", config);
		if (next === null) {
			throw new Error("expected a prop write");
		}
		const node = nodesById(next).get("t-2");
		expect(node?.props.label).toBe("edited");
		// `setNodeProp` rebuilds exactly this node — the third site.
		expect(node?.readOnly).toEqual({ label: true });
	});
});
