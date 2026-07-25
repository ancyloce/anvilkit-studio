/**
 * @file `VisualStyleSpec` schema and paint/border/shadow/filter
 * building blocks (PLAN-0020 CORE-P0-005B; DD-0019 §9.2, §11.5).
 *
 * Image paint sources are plain strings validated for scheme safety:
 * `javascript:` and other executable schemes are rejected here;
 * whether raw network URLs are allowed at all is host policy
 * (`EditorPolicies.allowRawUrls`), enforced by the engine, not the
 * schema.
 */

import type {
	Paint,
	ShadowSpec,
	VisualStyleSpec,
} from "@anvilkit/contracts/editor";
import { z } from "zod";
import {
	CssColorSchema,
	CssCornersSchema,
	CssLengthSchema,
	tokenOrLiteralSchema,
} from "./css.js";
import { FiniteNumberSchema, UnitIntervalSchema } from "./primitives.js";

const ColorValueSchema = tokenOrLiteralSchema(CssColorSchema);

/**
 * Image paint source: a host asset reference or an http(s) URL, or a
 * relative path. Executable and data-smuggling schemes are rejected
 * structurally.
 */
export const ImageSourceSchema = z.string().refine(
	(src) => {
		const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(src)?.[1]?.toLowerCase();
		if (scheme === undefined) {
			return true;
		}
		return (
			scheme === "http" ||
			scheme === "https" ||
			scheme === "asset" ||
			scheme === "design"
		);
	},
	{ message: "image source scheme must be http, https, asset, or design" },
);

/** Gradient color stop. */
export const GradientStopSchema = z.looseObject({
	color: ColorValueSchema,
	offset: UnitIntervalSchema,
});

/** Fill paint (P0 set: none, solid, linear gradient, image). */
export const PaintSchema: z.ZodType<Paint> = z.discriminatedUnion("kind", [
	z.looseObject({ kind: z.literal("none") }),
	z.looseObject({ kind: z.literal("solid"), color: ColorValueSchema }),
	z.looseObject({
		kind: z.literal("linear-gradient"),
		angle: FiniteNumberSchema,
		stops: z.array(GradientStopSchema).min(2),
	}),
	z.looseObject({
		kind: z.literal("image"),
		src: ImageSourceSchema,
		fit: z.enum(["cover", "contain", "fill", "none", "scale-down"]).optional(),
		position: z
			.looseObject({ x: UnitIntervalSchema, y: UnitIntervalSchema })
			.optional(),
	}),
]);

/** One border edge. */
export const BorderEdgeSchema = z.looseObject({
	style: z.enum(["none", "solid", "dashed", "dotted"]).optional(),
	width: CssLengthSchema.optional(),
	color: ColorValueSchema.optional(),
});

/** Per-edge border specification. */
export const BorderSpecSchema = z.looseObject({
	top: BorderEdgeSchema.optional(),
	right: BorderEdgeSchema.optional(),
	bottom: BorderEdgeSchema.optional(),
	left: BorderEdgeSchema.optional(),
});

/** One shadow layer. */
export const ShadowSpecSchema: z.ZodType<ShadowSpec> = z.looseObject({
	kind: z.enum(["drop", "inner"]),
	offsetX: CssLengthSchema,
	offsetY: CssLengthSchema,
	blur: CssLengthSchema,
	spread: CssLengthSchema.optional(),
	color: ColorValueSchema,
});

/** Basic filter set (ratios are identity-1 numbers; grayscale 0–1). */
export const FilterSpecSchema = z.looseObject({
	blur: CssLengthSchema.optional(),
	brightness: FiniteNumberSchema.refine((v) => v >= 0).optional(),
	contrast: FiniteNumberSchema.refine((v) => v >= 0).optional(),
	saturate: FiniteNumberSchema.refine((v) => v >= 0).optional(),
	grayscale: UnitIntervalSchema.optional(),
});

/** Standard CSS blend modes. */
export const CssBlendModeSchema = z.enum([
	"normal",
	"multiply",
	"screen",
	"overlay",
	"darken",
	"lighten",
	"color-dodge",
	"color-burn",
	"hard-light",
	"soft-light",
	"difference",
	"exclusion",
	"hue",
	"saturation",
	"color",
	"luminosity",
]);

/** Cursor values exposed by the inspector. */
export const CssCursorSchema = z.enum([
	"auto",
	"default",
	"pointer",
	"text",
	"move",
	"grab",
	"grabbing",
	"not-allowed",
]);

/** Universal visual style specification (DD-0019 §9.2, verbatim shape). */
export const VisualStyleSpecSchema: z.ZodType<VisualStyleSpec> = z.looseObject({
	background: PaintSchema.optional(),
	border: BorderSpecSchema.optional(),
	radius: CssCornersSchema.optional(),
	opacity: UnitIntervalSchema.optional(),
	shadows: z.array(ShadowSpecSchema).optional(),
	filter: FilterSpecSchema.optional(),
	blendMode: CssBlendModeSchema.optional(),
	cursor: CssCursorSchema.optional(),
});
