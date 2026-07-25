/**
 * @file Reusable style definition schemas
 * (PLAN-0020 CORE-P0-005C; DD-0019 §9.4, ED-STYLEDEF-001).
 *
 * Ordered multi-attach references, no inheritance graph. Timestamps
 * are ISO strings derived from command timestamps (contract freeze
 * CORE-P0-001 D-7).
 */

import type { StyleDefinitionV1 } from "@anvilkit/contracts/editor";
import { z } from "zod";
import { LayoutSpecSchema } from "./layout.js";
import {
	IdSchema,
	limitedRecordSchema,
	responsiveValueSchema,
} from "./primitives.js";
import { VisualStyleSpecSchema } from "./style.js";
import { TypographySpecSchema } from "./typography.js";

/** A reusable, document-local style definition (verbatim shape). */
export const StyleDefinitionSchema: z.ZodType<StyleDefinitionV1> =
	z.looseObject({
		version: z.literal("1"),
		id: IdSchema,
		name: z.string().min(1),
		appliesTo: z.enum(["any", "container", "text", "image"]),
		layout: responsiveValueSchema(LayoutSpecSchema).optional(),
		style: responsiveValueSchema(VisualStyleSpecSchema).optional(),
		typography: responsiveValueSchema(TypographySpecSchema).optional(),
		createdAt: z.string(),
		updatedAt: z.string(),
	});

/** The document style-definition collection (≤1,000 definitions). */
export const StyleDefinitionCollectionSchema = limitedRecordSchema(
	StyleDefinitionSchema,
	"styleDefinitions",
);
