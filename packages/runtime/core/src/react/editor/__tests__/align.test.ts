/**
 * @file CORE-P1B-013 — align/distribute: flow siblings prefer
 * parent-layout changes, absolute nodes align geometrically
 * (cross-parent allowed), one intent per operation (single command or
 * atomic batch), and distribute equalizing gap (flow) / spacing
 * (absolute).
 */

import { describe, expect, it } from "vitest";
import { buildAlignCommand, buildDistributeCommand } from "../canvas/align.js";
import { applyEditorCommand, createEmptyAuthoringState } from "../../../editor/index.js";
import type { AlignNode } from "../canvas/align.js";

const flowNode = (nodeId: string, x: number, y: number): AlignNode => ({
	nodeId,
	rect: { x, y, width: 100, height: 50 },
	position: "flow",
	parentId: "parent-1",
});
const absoluteNode = (
	nodeId: string,
	x: number,
	y: number,
	parentId = "parent-1",
): AlignNode => ({
	nodeId,
	rect: { x, y, width: 100, height: 50 },
	position: "absolute",
	parentId,
	parentRect: { x: 0, y: 0, width: 1000, height: 800 },
});

describe("align (CORE-P1B-013)", () => {
	it("flow siblings sharing a parent align via ONE parent-layout patch", () => {
		const command = buildAlignCommand("center", {
			nodes: [flowNode("a", 0, 0), flowNode("b", 200, 0)],
			revision: 0,
			flowParentId: "parent-1",
			parentDirection: "row",
		});
		expect(command?.type).toBe("node.layout.set");
		if (command?.type !== "node.layout.set") return;
		expect(command.nodeIds).toEqual(["parent-1"]);
		expect(command.patch).toEqual({ justifyContent: "center" });
	});

	it("cross-axis flow alignment writes alignItems", () => {
		const command = buildAlignCommand("middle", {
			nodes: [flowNode("a", 0, 0), flowNode("b", 200, 20)],
			revision: 0,
			flowParentId: "parent-1",
			parentDirection: "row",
		});
		if (command?.type !== "node.layout.set") throw new Error("wrong type");
		expect(command.patch).toEqual({ alignItems: "center" });
	});

	it("absolute nodes align geometrically across parents in one batch", () => {
		const command = buildAlignCommand("left", {
			nodes: [
				absoluteNode("a", 40, 0),
				absoluteNode("b", 200, 100, "parent-2"),
			],
			revision: 0,
		});
		expect(command?.type).toBe("batch");
		if (command?.type !== "batch") return;
		expect(command.commands).toHaveLength(2);
		for (const member of command.commands) {
			if (member.type !== "node.layout.set") throw new Error("wrong member");
			expect(member.patch).toEqual({
				inset: { left: { kind: "unit", value: 40, unit: "px" } },
			});
		}
	});

	it("returns null for <2 nodes and applies atomically through the engine", () => {
		expect(
			buildAlignCommand("left", { nodes: [flowNode("a", 0, 0)], revision: 0 }),
		).toBeNull();

		const command = buildAlignCommand("right", {
			nodes: [absoluteNode("a", 0, 0), absoluteNode("b", 300, 60)],
			revision: 0,
		});
		if (command === null) throw new Error("expected command");
		const result = applyEditorCommand(createEmptyAuthoringState(), command);
		expect(result.status).toBe("changed");
		expect(result.state.revision).toBe(1);
		// bounds right = 400; both nodes end at left = 300.
		expect(
			result.state.nodes.a?.layout?.base?.inset,
		).toEqual({ left: { kind: "unit", value: 300, unit: "px" } });
	});
});

describe("distribute (CORE-P1B-013)", () => {
	it("flow distribute equalizes the parent gap in one command", () => {
		const command = buildDistributeCommand("x", {
			nodes: [flowNode("a", 0, 0), flowNode("b", 120, 0), flowNode("c", 300, 0)],
			revision: 0,
			flowParentId: "parent-1",
			parentDirection: "row",
		});
		expect(command?.type).toBe("node.layout.set");
		if (command?.type !== "node.layout.set") return;
		expect(command.nodeIds).toEqual(["parent-1"]);
		// span 0..400, content 300 → gap (400-300)/2 = 50.
		expect(command.patch).toEqual({
			gap: { kind: "unit", value: 50, unit: "px" },
		});
	});

	it("absolute distribute evenly spaces between first and last", () => {
		const command = buildDistributeCommand("x", {
			nodes: [
				absoluteNode("a", 0, 0),
				absoluteNode("b", 110, 0),
				absoluteNode("c", 400, 0),
			],
			revision: 0,
		});
		expect(command?.type).toBe("batch");
		if (command?.type !== "batch") return;
		const lefts = command.commands.map((member) =>
			member.type === "node.layout.set"
				? (member.patch.inset as { left?: { value?: number } })?.left?.value
				: null,
		);
		// span 0..500, content 300 → spacing 100 → positions 0, 200, 400.
		expect(lefts).toEqual([0, 200, 400]);
	});

	it("returns null below three nodes", () => {
		expect(
			buildDistributeCommand("x", {
				nodes: [absoluteNode("a", 0, 0), absoluteNode("b", 100, 0)],
				revision: 0,
			}),
		).toBeNull();
	});
});
