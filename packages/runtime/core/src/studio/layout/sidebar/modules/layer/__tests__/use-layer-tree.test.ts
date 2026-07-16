/**
 * @file Tests for the Layer-tree view-model and the pure `resolveDrop`
 * resolver.
 *
 * `resolveDrop` is side-effect-free, so most behaviour (reorder vs.
 * move vs. cycle-guard) is asserted directly. `useLayerTree` is
 * exercised through `renderHook` with a stubbed `@puckeditor/core` so
 * the recursive builder (zone-prefix matching, nesting, labels) is
 * covered without a real Puck store.
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const snapshot: {
	appState: {
		data: {
			content: { type: string; props: { id: string } }[];
			zones: Record<string, { type: string; props: { id: string } }[]>;
		};
	};
	selectedItem: { props: { id: string } } | null;
	config: { components: Record<string, { label?: string }> };
} = {
	appState: { data: { content: [], zones: {} } },
	selectedItem: null,
	config: { components: {} },
};

vi.mock("@puckeditor/core", () => ({
	createUsePuck:
		() =>
		<T>(selector: (s: typeof snapshot) => T): T =>
			selector(snapshot),
	useGetPuck: () => () => snapshot,
}));

import {
	collectSubtreeZones,
	findAncestorIds,
	findNode,
	flattenVisibleRows,
	isCycleDrop,
	type LayerNode,
	ROOT_ZONE,
	resolveDrop,
	useLayerTree,
} from "../hooks/use-layer-tree";

describe("resolveDrop", () => {
	const noZones = new Set<string>();

	it("emits a reorder action for a same-zone move", () => {
		expect(
			resolveDrop({
				source: { zone: ROOT_ZONE, index: 0 },
				dest: { zone: ROOT_ZONE, index: 2 },
				draggedSubtreeZones: noZones,
			}),
		).toEqual({
			type: "reorder",
			sourceIndex: 0,
			destinationIndex: 2,
			destinationZone: ROOT_ZONE,
		});
	});

	it("emits a move action across zones", () => {
		expect(
			resolveDrop({
				source: { zone: ROOT_ZONE, index: 1 },
				dest: { zone: "abc:content", index: 0 },
				draggedSubtreeZones: noZones,
			}),
		).toEqual({
			type: "move",
			sourceIndex: 1,
			sourceZone: ROOT_ZONE,
			destinationIndex: 0,
			destinationZone: "abc:content",
		});
	});

	it("returns null when the destination is inside the dragged subtree (cycle)", () => {
		expect(
			resolveDrop({
				source: { zone: ROOT_ZONE, index: 0 },
				dest: { zone: "self:content", index: 0 },
				draggedSubtreeZones: new Set(["self:content"]),
			}),
		).toBeNull();
	});

	it("returns null for a no-op (same zone and index)", () => {
		expect(
			resolveDrop({
				source: { zone: ROOT_ZONE, index: 3 },
				dest: { zone: ROOT_ZONE, index: 3 },
				draggedSubtreeZones: noZones,
			}),
		).toBeNull();
	});
});

describe("useLayerTree", () => {
	it("builds a nested tree with labels and collects subtree zones", () => {
		snapshot.appState.data = {
			content: [
				{ type: "Layout", props: { id: "layout-1" } },
				{ type: "Text", props: { id: "text-1" } },
			],
			zones: {
				"layout-1:default": [{ type: "Text", props: { id: "text-2" } }],
			},
		};
		snapshot.selectedItem = { props: { id: "text-1" } };
		snapshot.config.components = { Layout: { label: "Section" }, Text: {} };

		const { result } = renderHook(() => useLayerTree());
		const { roots, selectedId } = result.current;

		expect(selectedId).toBe("text-1");
		expect(roots).toHaveLength(2);

		const layout = roots[0];
		expect(layout?.label).toBe("Section"); // config label wins
		expect(layout?.zone).toBe(ROOT_ZONE);
		expect(layout?.index).toBe(0);
		expect(layout?.childZones).toHaveLength(1);
		expect(layout?.childZones[0]?.zoneKey).toBe("layout-1:default");
		expect(layout?.childZones[0]?.slotName).toBe("default");
		expect(layout?.childZones[0]?.items[0]?.id).toBe("text-2");
		expect(layout?.childZones[0]?.items[0]?.depth).toBe(1);

		expect(roots[1]?.label).toBe("Text"); // falls back to type

		const found = findNode(roots, "text-2");
		expect(found?.id).toBe("text-2");
		expect(collectSubtreeZones(layout as NonNullable<typeof layout>)).toEqual(
			new Set(["layout-1:default"]),
		);
	});

	it("groups multiple sibling zones under one parent in insertion order", () => {
		snapshot.appState.data = {
			content: [{ type: "Layout", props: { id: "layout-1" } }],
			zones: {
				"layout-1:default": [{ type: "Text", props: { id: "text-a" } }],
				"layout-1:footer": [{ type: "Text", props: { id: "text-b" } }],
				// A different parent whose id shares no prefix collision.
				"layout-2:default": [{ type: "Text", props: { id: "text-c" } }],
			},
		};
		snapshot.selectedItem = null;
		snapshot.config.components = { Layout: {}, Text: {} };

		const { result } = renderHook(() => useLayerTree());
		const layout = result.current.roots[0];

		// Both of layout-1's zones are attached, in object insertion order,
		// and layout-2's zone is NOT mis-grouped under layout-1.
		expect(layout?.childZones.map((z) => z.zoneKey)).toEqual([
			"layout-1:default",
			"layout-1:footer",
		]);
		expect(layout?.childZones.map((z) => z.slotName)).toEqual([
			"default",
			"footer",
		]);
		expect(layout?.childZones[1]?.items[0]?.id).toBe("text-b");
		expect(collectSubtreeZones(layout as NonNullable<typeof layout>)).toEqual(
			new Set(["layout-1:default", "layout-1:footer"]),
		);
	});
});

describe("flattenVisibleRows", () => {
	// A small hand-built tree:
	//   layout-1 (root, has child zone "layout-1:default" with text-2)
	//            (also has an EMPTY zone "layout-1:footer")
	//   text-1   (root, leaf)
	const tree: LayerNode[] = [
		{
			id: "layout-1",
			type: "Layout",
			label: "Layout",
			zone: ROOT_ZONE,
			index: 0,
			depth: 0,
			childZones: [
				{
					zoneKey: "layout-1:default",
					slotName: "default",
					items: [
						{
							id: "text-2",
							type: "Text",
							label: "Text",
							zone: "layout-1:default",
							index: 0,
							depth: 1,
							childZones: [],
						},
					],
				},
				{ zoneKey: "layout-1:footer", slotName: "footer", items: [] },
			],
		},
		{
			id: "text-1",
			type: "Text",
			label: "Text",
			zone: ROOT_ZONE,
			index: 1,
			depth: 0,
			childZones: [],
		},
	];

	it("flattens expanded rows depth-first with node + zone-drop placeholders", () => {
		const rows = flattenVisibleRows(tree, {});
		expect(rows.map((r) => (r.type === "node" ? r.node.id : r.key))).toEqual([
			"layout-1",
			"text-2", // expanded default zone descends
			"zone:layout-1:footer", // empty expanded zone → placeholder
			"text-1",
		]);
		const layoutRow = rows[0];
		expect(layoutRow?.type === "node" && layoutRow.hasChildren).toBe(true);
		expect(layoutRow?.type === "node" && layoutRow.siblingCount).toBe(2);
		const placeholder = rows[2];
		expect(placeholder?.type).toBe("zone-drop");
		expect(placeholder?.type === "zone-drop" && placeholder.depth).toBe(1);
	});

	it("skips collapsed subtrees (no descendant rows, no placeholders)", () => {
		const rows = flattenVisibleRows(tree, { "layout-1": false });
		expect(rows.map((r) => (r.type === "node" ? r.node.id : r.key))).toEqual([
			"layout-1",
			"text-1",
		]);
	});
});

describe("findAncestorIds", () => {
	// layout-1 (root)
	//   └ default zone → layout-2
	//       └ default zone → text-3
	// text-1 (root, leaf, sibling of layout-1)
	const tree: LayerNode[] = [
		{
			id: "layout-1",
			type: "Layout",
			label: "Layout",
			zone: ROOT_ZONE,
			index: 0,
			depth: 0,
			childZones: [
				{
					zoneKey: "layout-1:default",
					slotName: "default",
					items: [
						{
							id: "layout-2",
							type: "Layout",
							label: "Layout",
							zone: "layout-1:default",
							index: 0,
							depth: 1,
							childZones: [
								{
									zoneKey: "layout-2:default",
									slotName: "default",
									items: [
										{
											id: "text-3",
											type: "Text",
											label: "Text",
											zone: "layout-2:default",
											index: 0,
											depth: 2,
											childZones: [],
										},
									],
								},
							],
						},
					],
				},
			],
		},
		{
			id: "text-1",
			type: "Text",
			label: "Text",
			zone: ROOT_ZONE,
			index: 1,
			depth: 0,
			childZones: [],
		},
	];

	it("returns the full ancestor chain for a deeply nested node", () => {
		expect(findAncestorIds(tree, "text-3")).toEqual(["layout-1", "layout-2"]);
	});

	it("returns a single-element chain for a direct child", () => {
		expect(findAncestorIds(tree, "layout-2")).toEqual(["layout-1"]);
	});

	it("returns an empty chain for a root node", () => {
		expect(findAncestorIds(tree, "layout-1")).toEqual([]);
		expect(findAncestorIds(tree, "text-1")).toEqual([]);
	});

	it("returns an empty chain for an id that does not exist", () => {
		expect(findAncestorIds(tree, "nonexistent")).toEqual([]);
	});
});

describe("isCycleDrop", () => {
	it("is true when the destination zone is inside the dragged subtree", () => {
		expect(isCycleDrop("self:content", new Set(["self:content"]))).toBe(true);
	});

	it("is false when the destination zone is outside the dragged subtree", () => {
		expect(isCycleDrop("other:content", new Set(["self:content"]))).toBe(false);
	});

	it("is false for a leaf node (empty subtree)", () => {
		expect(isCycleDrop("any:zone", new Set())).toBe(false);
	});
});
