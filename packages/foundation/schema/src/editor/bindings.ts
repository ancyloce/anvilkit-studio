/**
 * @file Safe expression AST and binding schemas
 * (PLAN-0020 CORE-P0-005E; DD-0019 §19).
 *
 * Arbitrary-JS expression shapes are unrepresentable: the AST is a
 * closed discriminated union, path segments are plain strings, and
 * depth (≤16) and node count (≤256) bombs are rejected **at parse
 * time** — the Phase 3 evaluator (CORE-P3-004) consumes this schema
 * unchanged.
 */

import type { BindingV1, SafeExpression } from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import { z } from "zod";
import { JsonValueSchema } from "./json.js";
import {
	EDITOR_LIMIT_ISSUE,
	IdSchema,
	limitedRecordSchema,
	PersistedNodeIdSchema,
} from "./primitives.js";

const SafeExpressionBareSchema: z.ZodType<SafeExpression> = z.lazy(() =>
	z.discriminatedUnion("type", [
		z.looseObject({ type: z.literal("literal"), value: JsonValueSchema }),
		z.looseObject({
			type: z.literal("path"),
			root: z.enum(["data", "item", "index", "page"]),
			path: z.array(z.string()),
		}),
		z.looseObject({
			type: z.literal("coalesce"),
			values: z.array(SafeExpressionBareSchema).min(1),
		}),
		z.looseObject({
			type: z.literal("compare"),
			operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte"]),
			left: SafeExpressionBareSchema,
			right: SafeExpressionBareSchema,
		}),
		z.looseObject({
			type: z.literal("boolean"),
			operator: z.enum(["and", "or"]),
			values: z.array(SafeExpressionBareSchema).min(1),
		}),
		z.looseObject({
			type: z.literal("not"),
			value: SafeExpressionBareSchema,
		}),
	]),
);

interface AstMeasure {
	readonly depth: number;
	readonly count: number;
}

function measureExpression(expression: SafeExpression): AstMeasure {
	switch (expression.type) {
		case "literal":
		case "path":
			return { depth: 1, count: 1 };
		case "not": {
			const inner = measureExpression(expression.value);
			return { depth: inner.depth + 1, count: inner.count + 1 };
		}
		case "compare": {
			const left = measureExpression(expression.left);
			const right = measureExpression(expression.right);
			return {
				depth: Math.max(left.depth, right.depth) + 1,
				count: left.count + right.count + 1,
			};
		}
		case "coalesce":
		case "boolean": {
			let depth = 0;
			let count = 1;
			for (const value of expression.values) {
				const inner = measureExpression(value);
				depth = Math.max(depth, inner.depth);
				count += inner.count;
			}
			return { depth: depth + 1, count };
		}
	}
}

/**
 * The safe expression AST, depth- and count-bounded at parse time
 * (limits from the frozen §7.3 table).
 */
export const SafeExpressionSchema: z.ZodType<SafeExpression> =
	SafeExpressionBareSchema.superRefine((expression, ctx) => {
		const { depth, count } = measureExpression(expression);
		if (depth > EDITOR_COUNT_LIMITS.bindingAstDepth) {
			ctx.addIssue({
				code: "custom",
				message: `${EDITOR_LIMIT_ISSUE}: bindingAstDepth (${depth} > ${EDITOR_COUNT_LIMITS.bindingAstDepth})`,
				params: {
					code: EDITOR_LIMIT_ISSUE,
					limitKey: "bindingAstDepth",
					limit: EDITOR_COUNT_LIMITS.bindingAstDepth,
					actual: depth,
				},
				input: depth,
			});
		}
		if (count > EDITOR_COUNT_LIMITS.bindingAstNodeCount) {
			ctx.addIssue({
				code: "custom",
				message: `${EDITOR_LIMIT_ISSUE}: bindingAstNodeCount (${count} > ${EDITOR_COUNT_LIMITS.bindingAstNodeCount})`,
				params: {
					code: EDITOR_LIMIT_ISSUE,
					limitKey: "bindingAstNodeCount",
					limit: EDITOR_COUNT_LIMITS.bindingAstNodeCount,
					actual: count,
				},
				input: count,
			});
		}
	});

/** A condition is a boolean-evaluated safe expression. */
export const SafeConditionSchema = SafeExpressionSchema;

/** What a binding writes to (DD-0019 §19, verbatim shape). */
export const BindingTargetSchema = z.discriminatedUnion("type", [
	z.looseObject({
		type: z.literal("prop"),
		path: z.array(z.union([z.string(), z.number().int()])).min(1),
	}),
	z.looseObject({ type: z.literal("visibility") }),
	z.looseObject({
		type: z.literal("repeat"),
		itemName: z.string().min(1),
		limit: z.number().int().positive().optional(),
	}),
]);

/** A stored binding (DD-0019 §19, verbatim shape). */
export const BindingSchema: z.ZodType<BindingV1> = z.looseObject({
	version: z.literal("1"),
	id: IdSchema,
	nodeId: PersistedNodeIdSchema,
	target: BindingTargetSchema,
	expression: SafeExpressionSchema,
	fallback: JsonValueSchema.optional(),
});

/** The document binding collection. */
export const BindingCollectionSchema = limitedRecordSchema(
	BindingSchema,
	// Bindings share the interactions cap scale; the frozen table has
	// no dedicated binding count, so the nodeRecords cap (the widest
	// per-node collection) is the effective ceiling.
	"nodeRecords",
);
