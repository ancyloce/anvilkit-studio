/**
 * Conditions and repeaters (PLAN-0020 CORE-P3-006; ED-BIND-002;
 * DD-0019 §19).
 */

import type {
	AuthoringStateV1,
	BindingV1,
	EditorCommandBase,
	JsonValue,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	applyEditorCommand,
	bindingUpdateErrors,
	buildRepeatContexts,
	createEmptyAuthoringState,
	isVisibleInPreview,
	itemKeyOf,
	type RepeatExpansion,
	repeatExportBlockers,
	resolveVisibility,
} from "../index.js";

let counter = 0;
function base(expectedRevision: number): EditorCommandBase {
	counter += 1;
	return {
		id: `bind-${counter}`,
		expectedRevision,
		source: "inspector",
		timestamp: 1_750_000_000_000,
	};
}

function binding(patch: Partial<BindingV1> = {}): BindingV1 {
	return {
		version: "1",
		id: "b1",
		nodeId: "n1",
		target: { type: "visibility" },
		expression: { type: "literal", value: true },
		...patch,
	};
}

describe("itemKeyOf — stable identity", () => {
	it("prefers conventional identity fields in order", () => {
		expect(itemKeyOf({ id: "a", uuid: "b" })).toBe("a");
		expect(itemKeyOf({ uuid: "b", slug: "c" })).toBe("b");
		expect(itemKeyOf({ slug: "c" })).toBe("c");
	});

	it("accepts finite numeric ids", () => {
		expect(itemKeyOf({ id: 7 })).toBe("7");
		expect(itemKeyOf({ id: Number.NaN })).toBeUndefined();
	});

	it("ignores empty strings and non-scalar identity fields", () => {
		expect(itemKeyOf({ id: "" })).toBeUndefined();
		// A stringified object is a content hash, not an identity: two
		// equal rows would collide and editing one would change its key.
		expect(itemKeyOf({ id: { nested: true } as never })).toBeUndefined();
	});

	it("returns undefined for primitives and arrays", () => {
		expect(itemKeyOf("row")).toBeUndefined();
		expect(itemKeyOf([1, 2])).toBeUndefined();
	});
});

describe("buildRepeatContexts", () => {
	it("produces one context per record with field keys", () => {
		const expansion = buildRepeatContexts(
			[{ id: "a" }, { id: "b" }] as JsonValue,
			50,
		);
		expect(expansion.contexts.map((c) => c.key)).toEqual(["a", "b"]);
		expect(expansion.contexts.map((c) => c.index)).toEqual([0, 1]);
		expect(expansion.indexKeyed).toBe(false);
	});

	it("falls back to index keys and flags it", () => {
		const expansion = buildRepeatContexts([{ name: "x" }] as JsonValue, 50);
		expect(expansion.contexts[0]?.key).toBe("0");
		expect(expansion.contexts[0]?.keySource).toBe("index");
		expect(expansion.indexKeyed).toBe(true);
	});

	it("honours the limit", () => {
		const rows = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }));
		expect(buildRepeatContexts(rows as JsonValue, 3).contexts).toHaveLength(3);
	});

	it("yields nothing for a non-array payload", () => {
		// Inventing a single-element repeat would hide the author's
		// mistake rather than surface it.
		expect(buildRepeatContexts({ a: 1 } as JsonValue, 50).contexts).toEqual([]);
	});

	it("never returns Puck nodes — only scopes (§19)", () => {
		const expansion = buildRepeatContexts([{ id: "a" }] as JsonValue, 50);
		const context = expansion.contexts[0];
		expect(Object.keys(context ?? {}).sort()).toEqual([
			"index",
			"item",
			"key",
			"keySource",
		]);
	});
});

describe("resolveVisibility", () => {
	it("resolves a satisfied condition to visible", () => {
		expect(
			resolveVisibility(
				{ type: "path", root: "data", path: ["show"] },
				{ data: { show: true } },
			),
		).toEqual({ status: "visible" });
	});

	it("resolves a falsy condition to hidden", () => {
		expect(
			resolveVisibility(
				{ type: "path", root: "data", path: ["show"] },
				{ data: { show: false } },
			),
		).toEqual({ status: "hidden" });
	});

	it("distinguishes indeterminate from hidden", () => {
		// A binding that cannot be evaluated is not the same as one the
		// author hid — conflating them makes nodes vanish unrecoverably.
		const missing = resolveVisibility(
			{ type: "path", root: "data", path: ["absent"] },
			{ data: {} },
		);
		expect(missing.status).toBe("indeterminate");

		const refused = resolveVisibility(
			{ type: "path", root: "data", path: ["constructor"] },
			{ data: {} },
		);
		expect(refused.status).toBe("indeterminate");
	});

	it("shows indeterminate content in preview rather than hiding it", () => {
		expect(
			isVisibleInPreview({ status: "indeterminate", reason: "missing" }),
		).toBe(true);
		expect(isVisibleInPreview({ status: "hidden" })).toBe(false);
	});
});

describe("repeatExportBlockers", () => {
	const repeatBinding = binding({
		id: "r1",
		target: { type: "repeat", itemName: "row" },
	});

	it("blocks a repeat whose rows are index-keyed", () => {
		const expansions = new Map<string, RepeatExpansion>([
			["r1", { contexts: [], indexKeyed: true }],
		]);
		expect(repeatExportBlockers({ r1: repeatBinding }, expansions)).toEqual([
			"r1",
		]);
	});

	it("allows a repeat with stable field keys", () => {
		const expansions = new Map<string, RepeatExpansion>([
			["r1", { contexts: [], indexKeyed: false }],
		]);
		expect(repeatExportBlockers({ r1: repeatBinding }, expansions)).toEqual([]);
	});

	it("does not block a repeat that has never been expanded", () => {
		// Unproven is not the same as unstable.
		expect(repeatExportBlockers({ r1: repeatBinding }, new Map())).toEqual([]);
	});

	it("ignores non-repeat bindings", () => {
		const expansions = new Map<string, RepeatExpansion>([
			["b1", { contexts: [], indexKeyed: true }],
		]);
		expect(repeatExportBlockers({ b1: binding() }, expansions)).toEqual([]);
	});
});

describe("binding.update command", () => {
	it("commits a binding into the sidecar", () => {
		const result = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "binding.update",
			binding: binding(),
		});
		expect(result.status).toBe("changed");
		if (result.status !== "changed") return;
		expect(result.state.bindings.b1?.nodeId).toBe("n1");
	});

	it("upserts rather than rejecting an existing id (freeze §2)", () => {
		const state: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			bindings: { b1: binding() },
		};
		expect(
			bindingUpdateErrors(
				state,
				binding({ expression: { type: "literal", value: false } }),
			),
		).toEqual([]);
	});

	it("rejects a repeat binding with an empty item name", () => {
		const errors = bindingUpdateErrors(
			createEmptyAuthoringState(),
			binding({ target: { type: "repeat", itemName: "  " } }),
		);
		expect(errors.length).toBeGreaterThan(0);
	});

	it("rejects a non-positive repeat limit", () => {
		const errors = bindingUpdateErrors(
			createEmptyAuthoringState(),
			binding({ target: { type: "repeat", itemName: "row", limit: 0 } }),
		);
		expect(errors.length).toBeGreaterThan(0);
	});

	it("aggregates structural issues into one error", () => {
		const errors = bindingUpdateErrors(
			createEmptyAuthoringState(),
			binding({ expression: { type: "call" } as never }),
		);
		const shape = errors.filter((e) => e.details?.kind === "binding");
		expect(shape).toHaveLength(1);
	});
});
