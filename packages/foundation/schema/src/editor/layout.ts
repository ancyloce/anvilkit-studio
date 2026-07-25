/**
 * @file `LayoutSpec` schema (PLAN-0020 CORE-P0-005B; DD-0019 §9.2).
 */

import type { LayoutSpec } from "@anvilkit/contracts/editor";
import { z } from "zod";
import {
	CssBoxEdgesSchema,
	CssLengthSchema,
	GridTrackListSchema,
	SizeValueSchema,
} from "./css.js";
import { FiniteNumberSchema } from "./primitives.js";

/** Cross-axis alignment values. */
export const CssAlignmentSchema = z.enum([
	"start",
	"center",
	"end",
	"stretch",
	"baseline",
]);

/** Main-axis justification values. */
export const CssJustificationSchema = z.enum([
	"start",
	"center",
	"end",
	"space-between",
	"space-around",
	"space-evenly",
	"stretch",
]);

/** Universal layout specification (DD-0019 §9.2, verbatim shape). */
export const LayoutSpecSchema: z.ZodType<LayoutSpec> = z.looseObject({
	display: z.enum(["block", "flex", "grid", "none"]).optional(),
	direction: z.enum(["row", "column"]).optional(),
	wrap: z.enum(["nowrap", "wrap"]).optional(),
	alignItems: CssAlignmentSchema.optional(),
	justifyContent: CssJustificationSchema.optional(),
	gap: CssLengthSchema.optional(),
	rowGap: CssLengthSchema.optional(),
	columnGap: CssLengthSchema.optional(),
	columns: GridTrackListSchema.optional(),
	rows: GridTrackListSchema.optional(),
	padding: CssBoxEdgesSchema.optional(),
	margin: CssBoxEdgesSchema.optional(),
	width: SizeValueSchema.optional(),
	height: SizeValueSchema.optional(),
	minWidth: CssLengthSchema.optional(),
	maxWidth: CssLengthSchema.optional(),
	minHeight: CssLengthSchema.optional(),
	maxHeight: CssLengthSchema.optional(),
	position: z.enum(["static", "relative", "absolute", "sticky"]).optional(),
	inset: CssBoxEdgesSchema.optional(),
	overflow: z.enum(["visible", "hidden", "auto", "scroll"]).optional(),
	zIndex: FiniteNumberSchema.refine((v) => Number.isInteger(v), {
		message: "zIndex must be an integer",
	}).optional(),
});
