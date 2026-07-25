/**
 * @file CORE-P1A-010/-011 — layer search + locked-subtree fencing:
 * §18 search correctness (name/type/id, ancestor retention, full
 * subtree under a direct match), the blank-query identity fast path,
 * locked-ancestor expansion, and the 10k-node interactivity budget
 * (search ≤200 ms).
 */

import { describe, expect, it } from "vitest";
import { collectLockedSubtree, filterLayerTree } from "../hooks/layer-search";
import type { LayerChildZone, LayerNode } from "../hooks/use-layer-tree";

function node(
	id: string,
	type: string,
	label: string,
	children: readonly LayerNode[] = [],
	depth = 0,
): LayerNode {
	const childZones: LayerChildZone[] =
		children.length === 0
			? []
			: [{ zoneKey: `${id}:content`, slotName: "content", items: children }];
	return { id, type, label, zone: "root", index: 0, depth, childZones };
}

const TREE: readonly LayerNode[] = [
	node("hero-1", "Hero", "Hero", [
		node("heading-1", "Heading", "Title", [], 1),
		node(
			"card-1",
			"Card",
			"Pricing card",
			[node("button-1", "Button", "Buy now", [], 2)],
			1,
		),
	]),
	node("footer-1", "Footer", "Footer"),
];

describe("filterLayerTree (§18 search)", () => {
	it("returns the input by reference for a blank query", () => {
		expect(filterLayerTree(TREE, "")).toBe(TREE);
		expect(filterLayerTree(TREE, "   ")).toBe(TREE);
	});

	it("matches by name, type, and id, case-insensitively", () => {
		expect(filterLayerTree(TREE, "pricing").length).toBe(1);
		expect(filterLayerTree(TREE, "BUTTON").length).toBe(1);
		expect(filterLayerTree(TREE, "footer-1").length).toBe(1);
		expect(filterLayerTree(TREE, "zzz").length).toBe(0);
	});

	it("retains ancestor context and prunes non-matching branches", () => {
		const filtered = filterLayerTree(TREE, "buy now");
		expect(filtered.map((n) => n.id)).toEqual(["hero-1"]);
		const hero = filtered[0] as LayerNode;
		const heroChildren = hero.childZones[0]?.items ?? [];
		// The Heading branch (no match) is pruned; the Card ancestor stays.
		expect(heroChildren.map((n) => n.id)).toEqual(["card-1"]);
		expect(heroChildren[0]?.childZones[0]?.items.map((n) => n.id)).toEqual([
			"button-1",
		]);
	});

	it("keeps the full subtree under a direct match", () => {
		const filtered = filterLayerTree(TREE, "pricing");
		const card = filtered[0]?.childZones[0]?.items[0] as LayerNode;
		expect(card.id).toBe("card-1");
		expect(card.childZones[0]?.items.map((n) => n.id)).toEqual(["button-1"]);
	});

	it("resolves names through the authoring name preference", () => {
		const named = filterLayerTree(TREE, "renamed", (nodeId, fallback) =>
			nodeId === "footer-1" ? "Renamed footer" : fallback,
		);
		expect(named.map((n) => n.id)).toEqual(["footer-1"]);
	});
});

describe("collectLockedSubtree (locked-ancestor fencing)", () => {
	it("fences locked nodes and every descendant", () => {
		const fenced = collectLockedSubtree(TREE, (id) => id === "card-1");
		expect([...fenced].sort()).toEqual(["button-1", "card-1"]);
	});

	it("is empty when nothing is locked", () => {
		expect(collectLockedSubtree(TREE, () => false).size).toBe(0);
	});
});

describe("10k-node interactivity budget (CORE-P1A-011)", () => {
	it("searches a 10k-node tree within 200 ms", () => {
		// 100 branches × (1 parent + 99 leaves) = 10 000 nodes.
		const big: LayerNode[] = Array.from({ length: 100 }, (_, branch) =>
			node(
				`branch-${branch}`,
				"Section",
				`Section ${branch}`,
				Array.from({ length: 99 }, (_, leaf) =>
					node(
						`leaf-${branch}-${leaf}`,
						"Text",
						`Paragraph ${branch}-${leaf}`,
						[],
						1,
					),
				),
			),
		);
		const startedAt = performance.now();
		const filtered = filterLayerTree(big, "paragraph 42-7");
		const elapsed = performance.now() - startedAt;
		expect(filtered.length).toBe(1);
		expect(filtered[0]?.childZones[0]?.items.length).toBeGreaterThanOrEqual(1);
		expect(elapsed).toBeLessThan(200);

		const lockStart = performance.now();
		const fenced = collectLockedSubtree(big, (id) => id === "branch-42");
		expect(fenced.size).toBe(100);
		expect(performance.now() - lockStart).toBeLessThan(200);
	});
});
