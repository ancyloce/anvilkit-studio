/**
 * @file Breakpoint set schema with the §12.2 invariants
 * (PLAN-0020 CORE-P0-005B; DD-0019 §12.2).
 *
 * Invariants enforced at parse time: `base` is implicit and never
 * stored; at most eight enabled breakpoints; `maxWidth` is a unique
 * integer 240–7680; ids are unique and never `"base"`. `order` is
 * display-only — {@link normalizeBreakpointOrder} recomputes it from
 * widths (widest first) rather than failing the parse.
 */

import type { BreakpointDefinition } from "@anvilkit/contracts/editor";
import { z } from "zod";
import {
	addLimitIssue,
	BreakpointIdSchema,
	NonNegativeIntegerSchema,
} from "./primitives.js";

/** One breakpoint definition (DD-0019 §9.1, verbatim shape). */
export const BreakpointDefinitionSchema: z.ZodType<BreakpointDefinition> =
	z.looseObject({
		id: BreakpointIdSchema,
		label: z.string(),
		maxWidth: z
			.number()
			.int()
			.refine((v) => v >= 240 && v <= 7680, {
				message: "maxWidth must be an integer from 240 through 7680",
			}),
		order: NonNegativeIntegerSchema,
		enabled: z.boolean(),
	});

/**
 * The document breakpoint set: §12.2 invariants across the array.
 */
export const BreakpointSetSchema = z
	.array(BreakpointDefinitionSchema)
	.superRefine((breakpoints, ctx) => {
		addLimitIssue(
			ctx,
			"breakpoints",
			breakpoints.filter((breakpoint) => breakpoint.enabled).length,
		);
		const ids = new Set<string>();
		const widths = new Set<number>();
		for (const [index, breakpoint] of breakpoints.entries()) {
			if (ids.has(breakpoint.id)) {
				ctx.addIssue({
					code: "custom",
					message: `duplicate breakpoint id "${breakpoint.id}"`,
					path: [index, "id"],
					input: breakpoint.id,
				});
			}
			ids.add(breakpoint.id);
			if (widths.has(breakpoint.maxWidth)) {
				ctx.addIssue({
					code: "custom",
					message: `duplicate breakpoint maxWidth ${breakpoint.maxWidth}`,
					path: [index, "maxWidth"],
					input: breakpoint.maxWidth,
				});
			}
			widths.add(breakpoint.maxWidth);
		}
	});

/**
 * Recompute display `order` from widths, widest first (DD-0019
 * §12.2: order is normalized from widths, not authored). Pure;
 * returns a new array, input untouched.
 */
export function normalizeBreakpointOrder(
	breakpoints: readonly BreakpointDefinition[],
): readonly BreakpointDefinition[] {
	return [...breakpoints]
		.sort((a, b) => b.maxWidth - a.maxWidth)
		.map((breakpoint, index) =>
			breakpoint.order === index ? breakpoint : { ...breakpoint, order: index },
		);
}
