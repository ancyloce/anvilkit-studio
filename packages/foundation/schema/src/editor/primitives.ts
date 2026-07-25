/**
 * @file Shared value primitives for the editor schemas
 * (PLAN-0020 CORE-P0-005A; DD-0019 §7.1–§7.3).
 *
 * Object schemas use `z.looseObject` (preserve unknown keys) rather
 * than the Zod default (`strip`): the authoring sidecar is a
 * versioned persisted format, so an older build must round-trip a
 * newer document's extra fields instead of silently deleting them —
 * the same posture as the Canvas IR validators. Unknown keys are
 * inert; consumers read only known fields.
 */

import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import { z } from "zod";

/** A finite number (rejects NaN and ±Infinity). */
export const FiniteNumberSchema = z
	.number()
	.refine((v) => Number.isFinite(v), { message: "must be a finite number" });

/** A non-negative finite number. */
export const NonNegativeFiniteNumberSchema = FiniteNumberSchema.refine(
	(v) => v >= 0,
	{ message: "must be >= 0" },
);

/** A non-negative integer (revisions, counts, indices). */
export const NonNegativeIntegerSchema = z
	.number()
	.int()
	.refine((v) => v >= 0, { message: "must be >= 0" });

/** A normalized 0–1 fraction (gradient offsets, focal points). */
export const UnitIntervalSchema = FiniteNumberSchema.refine(
	(v) => v >= 0 && v <= 1,
	{ message: "must be between 0 and 1" },
);

/** A non-empty identifier string. */
export const IdSchema = z.string().min(1);

/**
 * A breakpoint id: non-empty and never the reserved literal `"base"`
 * (contract freeze CORE-P0-001 §1.3).
 */
export const BreakpointIdSchema = IdSchema.refine((v) => v !== "base", {
	message: 'breakpoint id must not be the reserved literal "base"',
});

/**
 * A persisted node/definition-node id: non-empty and never the
 * runtime composite `${instanceNodeId}::${definitionNodeId}` form,
 * which must never be persisted (contract freeze CORE-P0-001 §1.1).
 */
export const PersistedNodeIdSchema = IdSchema.refine((v) => !v.includes("::"), {
	message: "runtime composite node ids must never be persisted",
});

/** A structural property path segment (string key or array index). */
export const PropertyPathSegmentSchema = z.union([
	z.string(),
	z.number().int(),
]);

/** A structural property path with at least one segment. */
export const PropertyPathSchema = z.array(PropertyPathSegmentSchema).min(1);

/**
 * The message prefix carried by every count/byte limit violation.
 * Issues also carry `params: { code, limitKey, limit, actual }` so
 * the engine can map them to typed `EDITOR_LIMIT_EXCEEDED` errors
 * without string parsing.
 */
export const EDITOR_LIMIT_ISSUE = "EDITOR_LIMIT_EXCEEDED";

/** Keys of the frozen §7.3 count-limit table. */
export type EditorCountLimitKey = keyof typeof EDITOR_COUNT_LIMITS;

/**
 * Add a stable `EDITOR_LIMIT_EXCEEDED` issue when `actual` exceeds
 * the frozen limit for `limitKey`. Shared by every collection schema
 * (DD-0019 §7.3: limits produce stable validation errors; data is
 * never silently truncated).
 */
export function addLimitIssue(
	ctx: { addIssue: (issue: z.core.$ZodRawIssue) => void },
	limitKey: EditorCountLimitKey,
	actual: number,
): void {
	const limit = EDITOR_COUNT_LIMITS[limitKey];
	if (actual > limit) {
		ctx.addIssue({
			code: "custom",
			message: `${EDITOR_LIMIT_ISSUE}: ${limitKey} (${actual} > ${limit})`,
			params: { code: EDITOR_LIMIT_ISSUE, limitKey, limit, actual },
			input: actual,
		});
	}
}

/**
 * Build a `ResponsiveValue<T>` schema around a value schema
 * (DD-0019 §9.1). Override entries admit `null` on parse — `null`
 * clears the local override and resumes inheritance; compaction
 * removes it and canonical state never persists it.
 */
export function responsiveValueSchema<T extends z.ZodType>(value: T) {
	return z.looseObject({
		base: value.optional(),
		overrides: z.record(BreakpointIdSchema, value.nullable()).optional(),
	});
}

/**
 * Build a record schema whose size is capped by a frozen §7.3 limit
 * and whose keys are validated as identifiers.
 */
export function limitedRecordSchema<T extends z.ZodType>(
	value: T,
	limitKey: EditorCountLimitKey,
) {
	return z
		.record(IdSchema, value)
		.superRefine((record, ctx) =>
			addLimitIssue(ctx, limitKey, Object.keys(record).length),
		);
}
