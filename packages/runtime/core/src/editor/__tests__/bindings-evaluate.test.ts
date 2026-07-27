/**
 * Safe binding expression evaluator — semantics and the §19 security
 * suite (PLAN-0020 CORE-P3-004; ED-BIND-001/002; DD-0019 §19).
 *
 * The security half of this file is written adversarially: each case
 * builds the object graph a hostile host adapter or collaboration peer
 * could actually produce, then asserts the evaluator refuses it *and*
 * that no attacker code ran. Probes (`getterCalls`, `toStringCalls`)
 * exist so a passing assertion cannot be satisfied by an evaluator
 * that invoked the trap and merely discarded the result.
 */

import type { SafeExpression } from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	type BindingScope,
	evaluateCondition,
	evaluateExpression,
} from "../bindings/evaluate.js";

const literal = (value: unknown): SafeExpression =>
	({ type: "literal", value }) as SafeExpression;

const path = (
	root: "data" | "item" | "index" | "page",
	...segments: string[]
): SafeExpression => ({ type: "path", root, path: segments });

describe("evaluateExpression — core semantics", () => {
	it("returns literals unchanged", () => {
		expect(evaluateExpression(literal(42))).toEqual({
			status: "value",
			value: 42,
		});
	});

	it("walks a path into own enumerable data", () => {
		const scope: BindingScope = { data: { user: { name: "Ada" } } };
		expect(evaluateExpression(path("data", "user", "name"), scope)).toEqual({
			status: "value",
			value: "Ada",
		});
	});

	it("reads array indices as string segments", () => {
		const scope: BindingScope = { data: { rows: ["a", "b", "c"] } };
		expect(evaluateExpression(path("data", "rows", "2"), scope)).toEqual({
			status: "value",
			value: "c",
		});
	});

	it("exposes item and index roots for repeaters", () => {
		const scope: BindingScope = { item: { title: "row" }, index: 3 };
		expect(evaluateExpression(path("item", "title"), scope)).toEqual({
			status: "value",
			value: "row",
		});
		expect(evaluateExpression(path("index"), scope)).toEqual({
			status: "value",
			value: 3,
		});
	});

	it("distinguishes an absent path from an explicit null", () => {
		const scope: BindingScope = { data: { present: null } };

		// An explicit null is a real authored value...
		expect(evaluateExpression(path("data", "present"), scope)).toEqual({
			status: "value",
			value: null,
		});
		// ...while an absent key is `missing`, which is what `fallback`
		// keys off. Collapsing these would fire fallback on real nulls.
		expect(evaluateExpression(path("data", "absent"), scope)).toEqual({
			status: "missing",
		});
	});

	it("coalesces past missing and null to the first real value", () => {
		const scope: BindingScope = { data: { a: null } };
		const expression: SafeExpression = {
			type: "coalesce",
			values: [path("data", "nope"), path("data", "a"), literal("fallback")],
		};
		expect(evaluateExpression(expression, scope)).toEqual({
			status: "value",
			value: "fallback",
		});
	});

	it("reports missing when every coalesce operand is absent", () => {
		const expression: SafeExpression = {
			type: "coalesce",
			values: [path("data", "x"), path("data", "y")],
		};
		expect(evaluateExpression(expression, { data: {} })).toEqual({
			status: "missing",
		});
	});

	it("compares scalars and refuses to coerce across types", () => {
		const eq = (l: unknown, r: unknown): SafeExpression => ({
			type: "compare",
			operator: "eq",
			left: literal(l),
			right: literal(r),
		});
		expect(evaluateExpression(eq(1, 1))).toEqual({
			status: "value",
			value: true,
		});
		expect(evaluateExpression(eq("1", 1))).toEqual({
			status: "value",
			value: false,
		});

		// `"10" > 9` must not quietly become true through coercion.
		const mixed: SafeExpression = {
			type: "compare",
			operator: "gt",
			left: literal("10"),
			right: literal(9),
		};
		expect(evaluateExpression(mixed)).toEqual({
			status: "value",
			value: false,
		});
	});

	it("orders numbers and strings within their own type", () => {
		const gt = (l: unknown, r: unknown): SafeExpression => ({
			type: "compare",
			operator: "gt",
			left: literal(l),
			right: literal(r),
		});
		expect(evaluateExpression(gt(10, 9))).toEqual({
			status: "value",
			value: true,
		});
		expect(evaluateExpression(gt("b", "a"))).toEqual({
			status: "value",
			value: true,
		});
	});

	it("treats non-scalar operands as unequal rather than deep-comparing", () => {
		const expression: SafeExpression = {
			type: "compare",
			operator: "eq",
			left: literal({ a: 1 }),
			right: literal({ a: 1 }),
		};
		expect(evaluateExpression(expression)).toEqual({
			status: "value",
			value: false,
		});
	});

	it("short-circuits and/or and negates with not", () => {
		const and: SafeExpression = {
			type: "boolean",
			operator: "and",
			values: [literal(true), literal(false)],
		};
		const or: SafeExpression = {
			type: "boolean",
			operator: "or",
			values: [literal(false), literal(1)],
		};
		expect(evaluateExpression(and)).toEqual({ status: "value", value: false });
		expect(evaluateExpression(or)).toEqual({ status: "value", value: true });
		expect(evaluateExpression({ type: "not", value: literal(0) })).toEqual({
			status: "value",
			value: true,
		});
	});
});

describe("evaluateExpression — §19 security suite", () => {
	it("blocks __proto__ even when it is an own enumerable key", () => {
		// This is the load-bearing case: JSON.parse produces an object
		// with an OWN, ENUMERABLE `__proto__`, so an own-enumerable-only
		// rule alone would happily traverse it.
		const parsed = JSON.parse('{"__proto__":{"polluted":true}}') as Record<
			string,
			unknown
		>;
		expect(Object.keys(parsed)).toContain("__proto__");

		const result = evaluateExpression(path("data", "__proto__", "polluted"), {
			data: parsed as never,
		});
		expect(result).toEqual({
			status: "rejected",
			reason: "blocked-key",
			detail: "__proto__",
		});
	});

	it("blocks constructor and prototype traversal", () => {
		for (const key of ["constructor", "prototype"]) {
			expect(evaluateExpression(path("data", key), { data: {} })).toEqual({
				status: "rejected",
				reason: "blocked-key",
				detail: key,
			});
		}
	});

	it("never invokes a getter — the accessor is refused, not called", () => {
		let getterCalls = 0;
		const hostile = {};
		Object.defineProperty(hostile, "trap", {
			enumerable: true,
			configurable: true,
			get() {
				getterCalls += 1;
				return "escaped";
			},
		});

		const result = evaluateExpression(path("data", "trap"), {
			data: hostile as never,
		});

		expect(result).toEqual({
			status: "rejected",
			reason: "accessor-property",
			detail: "trap",
		});
		// The assertion that actually matters: the trap never ran.
		expect(getterCalls).toBe(0);
	});

	it("does not invoke a getter buried mid-path", () => {
		let getterCalls = 0;
		const inner = {};
		Object.defineProperty(inner, "deep", {
			enumerable: true,
			get() {
				getterCalls += 1;
				return { leaf: "escaped" };
			},
		});

		const result = evaluateExpression(path("data", "a", "deep", "leaf"), {
			data: { a: inner } as never,
		});

		expect(result.status).toBe("rejected");
		expect(getterCalls).toBe(0);
	});

	it("refuses non-enumerable own properties", () => {
		const hidden = {};
		Object.defineProperty(hidden, "secret", {
			enumerable: false,
			value: "classified",
		});
		expect(
			evaluateExpression(path("data", "secret"), { data: hidden as never }),
		).toEqual({
			status: "rejected",
			reason: "non-enumerable-property",
			detail: "secret",
		});
	});

	it("cannot reach inherited properties", () => {
		const parent = { inherited: "visible-to-js" };
		const child = Object.create(parent) as Record<string, unknown>;
		child.own = "fine";

		expect(
			evaluateExpression(path("data", "own"), { data: child as never }),
		).toEqual({ status: "value", value: "fine" });
		// Present via the prototype chain in plain JS, invisible here.
		expect((child as { inherited?: string }).inherited).toBe("visible-to-js");
		expect(
			evaluateExpression(path("data", "inherited"), { data: child as never }),
		).toEqual({ status: "missing" });
	});

	it("refuses function values instead of returning something callable", () => {
		const withFn = { run: () => "executed" };
		expect(
			evaluateExpression(path("data", "run"), { data: withFn as never }),
		).toEqual({
			status: "rejected",
			reason: "function-value",
			detail: "run",
		});
	});

	it("never coerces values through toString/valueOf", () => {
		let toStringCalls = 0;
		const sneaky = {
			value: {
				toString() {
					toStringCalls += 1;
					return "coerced";
				},
			},
		};
		const expression: SafeExpression = {
			type: "compare",
			operator: "gt",
			left: path("data", "value"),
			right: literal("aaa"),
		};
		evaluateExpression(expression, { data: sneaky as never });
		expect(toStringCalls).toBe(0);
	});

	it("rejects a depth bomb at the frozen limit", () => {
		let bomb: SafeExpression = literal(1);
		for (let i = 0; i < EDITOR_COUNT_LIMITS.bindingAstDepth + 5; i += 1) {
			bomb = { type: "not", value: bomb };
		}
		expect(evaluateExpression(bomb)).toMatchObject({
			status: "rejected",
			reason: "depth-exceeded",
		});
	});

	it("evaluates a chain that sits exactly at the depth limit", () => {
		// depth 1 is the root node, so `limit - 1` wrappers puts the
		// innermost literal exactly at the cap.
		let chain: SafeExpression = literal(true);
		for (let i = 0; i < EDITOR_COUNT_LIMITS.bindingAstDepth - 1; i += 1) {
			chain = { type: "not", value: chain };
		}
		expect(evaluateExpression(chain).status).toBe("value");
	});

	it("rejects a node-count bomb that stays shallow", () => {
		// Wide rather than deep: passes any depth check, so the node
		// budget is the only thing standing between us and a stall.
		const wide: SafeExpression = {
			type: "coalesce",
			values: Array.from(
				{ length: EDITOR_COUNT_LIMITS.bindingAstNodeCount + 10 },
				() => path("data", "absent"),
			),
		};
		expect(evaluateExpression(wide, { data: {} })).toMatchObject({
			status: "rejected",
			reason: "node-count-exceeded",
		});
	});

	it("rejects an AST node outside the closed union", () => {
		const forged = {
			type: "call",
			callee: "fetch",
		} as unknown as SafeExpression;
		expect(evaluateExpression(forged)).toMatchObject({
			status: "rejected",
			reason: "unsupported-node",
		});
	});

	it("cannot be impersonated by data shaped like an internal refusal", () => {
		// The evaluator brands refusals with a symbol precisely so this
		// literal cannot masquerade as one and abort a valid expression.
		const scope: BindingScope = {
			data: { payload: { reason: "blocked-key", detail: "__proto__" } },
		};
		expect(evaluateExpression(path("data", "payload"), scope)).toEqual({
			status: "value",
			value: { reason: "blocked-key", detail: "__proto__" },
		});
	});

	it("leaves Object.prototype unpolluted after hostile input", () => {
		const parsed = JSON.parse('{"__proto__":{"pwned":true}}') as never;
		evaluateExpression(path("data", "__proto__", "pwned"), { data: parsed });
		expect(({} as Record<string, unknown>).pwned).toBeUndefined();
	});
});

describe("evaluateCondition", () => {
	it("is total: missing and rejected both read as false", () => {
		expect(evaluateCondition(path("data", "absent"), { data: {} })).toBe(false);
		expect(evaluateCondition(path("data", "constructor"), { data: {} })).toBe(
			false,
		);
	});

	it("evaluates truthiness with JavaScript's own rules", () => {
		expect(evaluateCondition(literal("non-empty"))).toBe(true);
		expect(evaluateCondition(literal(""))).toBe(false);
		expect(evaluateCondition(literal([]))).toBe(true);
	});
});
