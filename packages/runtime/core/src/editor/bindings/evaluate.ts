/**
 * @file Safe binding expression evaluator (PLAN-0020 CORE-P3-004;
 * DD-0019 §19; ED-BIND-001/002).
 *
 * §19's guarantee is that **arbitrary JavaScript is provably never
 * evaluated**. That is upheld structurally rather than by sanitising:
 * `SafeExpression` is a closed discriminated union with no call node,
 * so a function invocation is unrepresentable in the AST. This file
 * completes the guarantee on the *data* side, where the hostile input
 * is not the expression but the object graph it reads.
 *
 * Three rules carry the security weight:
 *
 * 1. **Descriptor reads only.** Every property read goes through
 *    `Object.getOwnPropertyDescriptor` and takes `descriptor.value`.
 *    A plain `container[key]` would *invoke* a getter, which is the
 *    one way a data object could run code during evaluation. Accessor
 *    descriptors are rejected, never called.
 * 2. **Own enumerable only.** Inherited and non-enumerable properties
 *    are invisible, so prototype-chain reads cannot reach anything.
 * 3. **Blocked keys.** `__proto__`, `prototype` and `constructor` are
 *    rejected by name *before* the descriptor lookup. This is not
 *    redundant with rule 2: `JSON.parse('{"__proto__":{"a":1}}')`
 *    produces an object with an **own, enumerable** `__proto__`, so a
 *    host adapter returning parsed JSON can hand us exactly that.
 *
 * The evaluator re-enforces the §19 depth (16) and node-count (256)
 * caps even though `@anvilkit/schema` already rejects bombs at parse
 * time. It must stay safe for an AST that never went through the
 * schema — collaboration peers and in-memory construction both reach
 * this code directly. Defence in depth is deliberate, not duplication.
 *
 * Like `resolveToken`, evaluation is total: it returns a discriminated
 * result and never throws, so a hostile document degrades to a
 * diagnostic instead of taking down the editor.
 */

import type {
	JsonValue,
	SafeCondition,
	SafeExpression,
} from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";

/** The four addressable roots of a `path` expression (§19). */
export interface BindingScope {
	readonly data?: JsonValue;
	readonly item?: JsonValue;
	readonly index?: number;
	readonly page?: JsonValue;
}

/** Why an expression was refused outright. */
export type SafeEvaluationRejection =
	/** AST nesting exceeded `bindingAstDepth`. */
	| "depth-exceeded"
	/** AST node count exceeded `bindingAstNodeCount`. */
	| "node-count-exceeded"
	/** A path segment named `__proto__`, `prototype` or `constructor`. */
	| "blocked-key"
	/** A path segment resolved to a getter/setter — never invoked. */
	| "accessor-property"
	/** A path segment resolved to a non-enumerable own property. */
	| "non-enumerable-property"
	/** A path segment resolved to a function value. */
	| "function-value"
	/** The AST carried a `type` outside the closed union. */
	| "unsupported-node";

/**
 * The outcome of evaluating one expression.
 *
 * `missing` is distinct from `{status:"value", value:null}` on
 * purpose: a binding's `fallback` applies to an *absent* path, while
 * an explicit `null` in the data is a real value the author asked for.
 * Collapsing the two would make `fallback` fire on legitimate nulls.
 */
export type SafeEvaluation =
	| { readonly status: "value"; readonly value: JsonValue }
	| { readonly status: "missing" }
	| {
			readonly status: "rejected";
			readonly reason: SafeEvaluationRejection;
			/** The offending path segment or node type, when meaningful. */
			readonly detail?: string;
	  };

/**
 * Property names that must never be traversed. See rule 3 in the file
 * header — `JSON.parse` can make `__proto__` an own enumerable key, so
 * this check is load-bearing rather than belt-and-braces.
 */
const BLOCKED_KEYS: ReadonlySet<string> = new Set([
	"__proto__",
	"prototype",
	"constructor",
]);

/**
 * Internal sentinel for "no value here". Kept local so it can never be
 * confused with a caller-supplied `undefined`; `JsonValue` has no
 * `undefined` member, so this cannot collide with real data.
 */
const MISSING = Symbol("anvilkit.binding.missing");

type Internal = JsonValue | typeof MISSING;

/** Mutable traversal budget shared by one `evaluateExpression` call. */
interface Budget {
	remainingNodes: number;
}

/**
 * Brand for {@link Refusal}. A refusal travels the same return channel
 * as evaluated data, and that data is attacker-shaped — a structural
 * check like `"reason" in value` would let the literal JSON object
 * `{"reason":"blocked-key"}` impersonate a refusal and abort a
 * perfectly valid expression. A symbol key cannot appear in
 * `JsonValue`, so the two can never be confused.
 */
const REFUSAL = Symbol("anvilkit.binding.refusal");

/** A rejection raised mid-traversal, unwound without exceptions. */
interface Refusal {
	readonly [REFUSAL]: true;
	readonly reason: SafeEvaluationRejection;
	readonly detail?: string;
}

function refuse(reason: SafeEvaluationRejection, detail?: string): Refusal {
	return detail === undefined
		? { [REFUSAL]: true, reason }
		: { [REFUSAL]: true, reason, detail };
}

type Step = Internal | Refusal;

/**
 * Read one own, enumerable, data-valued property.
 *
 * This is the single choke point for every property access in the
 * evaluator — `container[key]` appears nowhere else in this file, and
 * that is what makes the "no getter is ever invoked" claim checkable
 * by reading one function.
 */
function readOwnValue(container: Internal, key: string): Step {
	if (container === MISSING) return MISSING;
	if (container === null || typeof container !== "object") return MISSING;
	if (BLOCKED_KEYS.has(key)) {
		return refuse("blocked-key", key);
	}

	const descriptor = Object.getOwnPropertyDescriptor(container, key);
	if (descriptor === undefined) return MISSING;
	if (!descriptor.enumerable) {
		return refuse("non-enumerable-property", key);
	}
	// An accessor descriptor has no `value`. Reading it would run the
	// getter, so the property is refused rather than resolved.
	if (!("value" in descriptor)) {
		return refuse("accessor-property", key);
	}

	const value: unknown = descriptor.value;
	if (typeof value === "function") {
		return refuse("function-value", key);
	}
	return value as Internal;
}

/** Resolve the root object a `path` expression starts from. */
function readRoot(scope: BindingScope, root: string): Internal {
	switch (root) {
		case "data":
			return scope.data === undefined ? MISSING : scope.data;
		case "item":
			return scope.item === undefined ? MISSING : scope.item;
		case "index":
			return scope.index === undefined ? MISSING : scope.index;
		case "page":
			return scope.page === undefined ? MISSING : scope.page;
		default:
			return MISSING;
	}
}

/**
 * JSON truthiness, matching JavaScript's own rules so authors are not
 * surprised: `false`, `0`, `""`, `null` and absent are falsy; empty
 * arrays and objects are truthy.
 */
function isTruthy(value: Internal): boolean {
	if (value === MISSING || value === null) return false;
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
	if (typeof value === "string") return value.length > 0;
	return true;
}

/**
 * Equality over scalars only.
 *
 * Structural equality on arrays/objects is deliberately out of scope:
 * it is unbounded work on attacker-shaped data, and §19's grammar
 * exists for scalar conditions. A non-scalar operand makes `eq` false
 * (and therefore `neq` true) rather than silently deep-comparing.
 */
function scalarEquals(left: Internal, right: Internal): boolean {
	if (left === MISSING || right === MISSING) return false;
	if (left === null || right === null) return left === right;
	if (typeof left === "object" || typeof right === "object") return false;
	return left === right;
}

/**
 * Ordering for `gt`/`gte`/`lt`/`lte`. Both operands must be numbers,
 * or both strings; every mixed or non-scalar comparison is `false`
 * rather than coerced, so `"10" > 9` cannot quietly become true.
 */
function compareOrdered(
	operator: "gt" | "gte" | "lt" | "lte",
	left: Internal,
	right: Internal,
): boolean {
	const bothNumbers = typeof left === "number" && typeof right === "number";
	const bothStrings = typeof left === "string" && typeof right === "string";
	if (!bothNumbers && !bothStrings) return false;
	if (bothNumbers && (Number.isNaN(left) || Number.isNaN(right))) return false;

	switch (operator) {
		case "gt":
			return left > right;
		case "gte":
			return left >= right;
		case "lt":
			return left < right;
		default:
			return left <= right;
	}
}

function evaluateNode(
	expression: SafeExpression,
	scope: BindingScope,
	depth: number,
	budget: Budget,
): Step {
	if (depth > EDITOR_COUNT_LIMITS.bindingAstDepth) {
		return refuse("depth-exceeded", String(depth));
	}
	budget.remainingNodes -= 1;
	if (budget.remainingNodes < 0) {
		return refuse("node-count-exceeded");
	}

	switch (expression.type) {
		case "literal":
			return expression.value;

		case "path": {
			let cursor: Internal = readRoot(scope, expression.root);
			for (const segment of expression.path) {
				const next = readOwnValue(cursor, segment);
				if (isRefusal(next)) return next;
				cursor = next;
				if (cursor === MISSING) return MISSING;
			}
			return cursor;
		}

		case "coalesce": {
			// The one operator whose job is absence: skip missing and
			// null operands, and fall through to `MISSING` if none hold.
			for (const candidate of expression.values) {
				const result = evaluateNode(candidate, scope, depth + 1, budget);
				if (isRefusal(result)) return result;
				if (result !== MISSING && result !== null) return result;
			}
			return MISSING;
		}

		case "compare": {
			const left = evaluateNode(expression.left, scope, depth + 1, budget);
			if (isRefusal(left)) return left;
			const right = evaluateNode(expression.right, scope, depth + 1, budget);
			if (isRefusal(right)) return right;

			switch (expression.operator) {
				case "eq":
					return scalarEquals(left, right);
				case "neq":
					return !scalarEquals(left, right);
				default:
					return compareOrdered(expression.operator, left, right);
			}
		}

		case "boolean": {
			// Short-circuiting is observable through the node budget, which
			// is fine — an unevaluated branch cannot cost or leak anything.
			if (expression.operator === "and") {
				for (const operand of expression.values) {
					const result = evaluateNode(operand, scope, depth + 1, budget);
					if (isRefusal(result)) return result;
					if (!isTruthy(result)) return false;
				}
				return true;
			}
			for (const operand of expression.values) {
				const result = evaluateNode(operand, scope, depth + 1, budget);
				if (isRefusal(result)) return result;
				if (isTruthy(result)) return true;
			}
			return false;
		}

		case "not": {
			const result = evaluateNode(expression.value, scope, depth + 1, budget);
			if (isRefusal(result)) return result;
			return !isTruthy(result);
		}

		default:
			return refuse(
				"unsupported-node",
				String((expression as { type?: unknown }).type),
			);
	}
}

function isRefusal(step: Step): step is Refusal {
	return (
		typeof step === "object" &&
		step !== null &&
		(step as Partial<Refusal>)[REFUSAL] === true
	);
}

/**
 * Evaluate a {@link SafeExpression} against a binding scope.
 *
 * Total: every input produces a `value`, `missing` or `rejected`
 * result. Callers apply `BindingV1.fallback` on `missing`, and surface
 * `rejected` as a diagnostic — a refused expression must never be
 * treated as "false", because that would silently hide content whose
 * visibility binding was tampered with.
 */
export function evaluateExpression(
	expression: SafeExpression,
	scope: BindingScope = {},
): SafeEvaluation {
	const budget: Budget = {
		remainingNodes: EDITOR_COUNT_LIMITS.bindingAstNodeCount,
	};
	const result = evaluateNode(expression, scope, 1, budget);

	if (isRefusal(result)) {
		return result.detail === undefined
			? { status: "rejected", reason: result.reason }
			: { status: "rejected", reason: result.reason, detail: result.detail };
	}
	if (result === MISSING) return { status: "missing" };
	return { status: "value", value: result };
}

/**
 * Evaluate a condition to a definite boolean.
 *
 * Conditions gate visibility and interaction firing, so they must be
 * total. `missing` is `false` (an absent flag is not a set flag), and
 * a **rejected** condition is also `false` — refusing to act on an
 * expression we would not evaluate is the safe direction. Callers that
 * need to distinguish the two use {@link evaluateExpression} and read
 * the diagnostic.
 */
export function evaluateCondition(
	condition: SafeCondition,
	scope: BindingScope = {},
): boolean {
	const result = evaluateExpression(condition, scope);
	return result.status === "value" && isTruthy(result.value);
}
