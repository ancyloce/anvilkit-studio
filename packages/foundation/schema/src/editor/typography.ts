/**
 * @file `TypographySpec` schema (PLAN-0020 CORE-P0-005B; DD-0019 §9.2).
 *
 * Font family literals are plain family-name strings — quotes,
 * semicolons, and braces are rejected so a family name can never
 * smuggle declaration syntax through the allowlisted serializer.
 */

import type { TypographySpec } from "@anvilkit/contracts/editor";
import { z } from "zod";
import {
	CssColorSchema,
	CssLengthSchema,
	tokenOrLiteralSchema,
} from "./css.js";
import { FiniteNumberSchema } from "./primitives.js";

/** A safe font-family name literal. */
export const FontFamilyNameSchema = z
	.string()
	.min(1)
	.refine((v) => !/[;{}"'\\]/.test(v), {
		message: "font family must be a plain family name",
	});

/** A font weight (1–1000, integer). */
export const FontWeightSchema = FiniteNumberSchema.refine(
	(v) => Number.isInteger(v) && v >= 1 && v <= 1000,
	{ message: "font weight must be an integer from 1 through 1000" },
);

/** Universal typography specification (DD-0019 §9.2, verbatim shape). */
export const TypographySpecSchema: z.ZodType<TypographySpec> = z.looseObject({
	fontFamily: tokenOrLiteralSchema(FontFamilyNameSchema).optional(),
	fontSize: tokenOrLiteralSchema(CssLengthSchema).optional(),
	fontWeight: tokenOrLiteralSchema(FontWeightSchema).optional(),
	lineHeight: tokenOrLiteralSchema(
		z.union([FiniteNumberSchema, CssLengthSchema]),
	).optional(),
	letterSpacing: tokenOrLiteralSchema(CssLengthSchema).optional(),
	color: tokenOrLiteralSchema(CssColorSchema).optional(),
	textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
	textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
	textTransform: z
		.enum(["none", "uppercase", "lowercase", "capitalize"])
		.optional(),
	textWrap: z.enum(["wrap", "nowrap", "balance", "pretty"]).optional(),
});
