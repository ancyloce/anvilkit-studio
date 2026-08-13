/**
 * @file Regression tests for review 0036 H-3 — wrap must put the child
 * where the container actually renders it.
 *
 * `wrapNode` used to create the container with `props: { id }` and no
 * slot prop, then park the wrapped child in
 * `data.zones["<containerId>:<slot>"]` — Puck's *legacy* DropZone map.
 * A slot-field container renders `props.<slot>`, so the child vanished
 * from the canvas while still sitting in the document, and selection
 * landed on an apparently-empty container. `unwrapNode` had the mirror
 * gap: it read children only from `zones[targetId:*]`, so a container
 * whose children lived in a slot prop reported "nothing to unwrap".
 */

import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { unwrapNode, wrapNode } from "../native-tree.js";

const config = {
	root: { fields: {} },
	components: {
		Section: { fields: { content: { type: "slot" } }, render: () => null },
		Text: { fields: {}, render: () => null },
	},
} as unknown as Config;

function doc(): Data {
	return {
		root: { props: { title: "Home" } },
		content: [
			{ type: "Text", props: { id: "t-1" } },
			{ type: "Text", props: { id: "t-2" } },
		],
	} as unknown as Data;
}

function contentIds(data: Data): string[] {
	return (data.content as readonly { props: { id: string } }[]).map(
		(node) => node.props.id,
	);
}

function nodeById(
	data: Data,
	id: string,
): { type: string; props: Record<string, unknown> } | undefined {
	return (
		data.content as readonly { type: string; props: Record<string, unknown> }[]
	).find((node) => node.props.id === id);
}

function legacyZones(data: Data): Record<string, unknown> {
	return ((data as { zones?: Record<string, unknown> }).zones ?? {}) as Record<
		string,
		unknown
	>;
}

describe("wrapNode — the child lands in the slot prop (0036 H-3)", () => {
	it("puts the wrapped node in the container's declared slot", () => {
		const result = wrapNode(doc(), "t-1", "Section", "content", config);
		if (result === null) {
			throw new Error("expected a wrap result");
		}

		const container = nodeById(result.data, result.containerId);
		expect(container?.type).toBe("Section");
		// The fix: the child is in `props.content`, which is what a
		// slot-field Section actually renders.
		expect(container?.props.content).toEqual([
			{ type: "Text", props: { id: "t-1" } },
		]);
	});

	it("writes no legacy zone entry", () => {
		const result = wrapNode(doc(), "t-1", "Section", "content", config);
		if (result === null) {
			throw new Error("expected a wrap result");
		}
		expect(
			legacyZones(result.data)[`${result.containerId}:content`],
		).toBeUndefined();
		expect(Object.keys(legacyZones(result.data))).toEqual([]);
	});

	it("takes the wrapped node's place in document order", () => {
		const result = wrapNode(doc(), "t-1", "Section", "content", config);
		if (result === null) {
			throw new Error("expected a wrap result");
		}
		expect(contentIds(result.data)).toEqual([result.containerId, "t-2"]);
	});

	it("returns null for an unknown node", () => {
		expect(wrapNode(doc(), "nope", "Section", "content", config)).toBeNull();
	});
});

describe("unwrapNode — reads children from the slot prop (0036 H-3)", () => {
	it("lifts slot children into the container's place", () => {
		const wrapped = wrapNode(doc(), "t-1", "Section", "content", config);
		if (wrapped === null) {
			throw new Error("expected a wrap result");
		}

		// Before the fix this returned null: the children were in
		// `props.content` and unwrap only looked at `data.zones`.
		const next = unwrapNode(wrapped.data, wrapped.containerId, config);
		if (next === null) {
			throw new Error("expected an unwrap result");
		}
		expect(contentIds(next)).toEqual(["t-1", "t-2"]);
	});

	it("round-trips a wrap back to the original document shape", () => {
		const original = doc();
		const wrapped = wrapNode(original, "t-1", "Section", "content", config);
		if (wrapped === null) {
			throw new Error("expected a wrap result");
		}
		const next = unwrapNode(wrapped.data, wrapped.containerId, config);
		if (next === null) {
			throw new Error("expected an unwrap result");
		}
		expect(next.content).toEqual(original.content);
	});

	it("returns null for a container with nothing in it", () => {
		const empty = {
			root: { props: {} },
			content: [{ type: "Section", props: { id: "sec-1", content: [] } }],
		} as unknown as Data;
		expect(unwrapNode(empty, "sec-1", config)).toBeNull();
	});

	it("still unwraps a legacy DropZone document", () => {
		// Pre-migration documents keep working: zones are read, just never
		// written.
		const legacy = {
			root: { props: {} },
			content: [{ type: "Section", props: { id: "sec-1" } }],
			zones: { "sec-1:content": [{ type: "Text", props: { id: "t-9" } }] },
		} as unknown as Data;

		const next = unwrapNode(legacy, "sec-1", config);
		if (next === null) {
			throw new Error("expected an unwrap result");
		}
		expect(contentIds(next)).toEqual(["t-9"]);
		expect(legacyZones(next)["sec-1:content"]).toBeUndefined();
	});
});
