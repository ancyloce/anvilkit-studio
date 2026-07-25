/**
 * @file Variant axis and combination schemas
 * (PLAN-0020 CORE-P0-005D; DD-0019 §14.2, §14.4).
 *
 * Caps (≤3 axes, ≤20 combinations per component) are enforced by the
 * component definition schema, which owns the per-component view.
 */

import type {
	ComponentVariant,
	NodeOverridePatch,
	VariantAxis,
} from "@anvilkit/contracts/editor";
import { z } from "zod";
import { JsonValueSchema } from "./json.js";
import { LayoutSpecSchema } from "./layout.js";
import {
	IdSchema,
	PersistedNodeIdSchema,
	responsiveValueSchema,
} from "./primitives.js";
import { VisualStyleSpecSchema } from "./style.js";
import { TypographySpecSchema } from "./typography.js";

/** One option of a variant axis. */
export const VariantAxisOptionSchema = z.looseObject({
	id: IdSchema,
	name: z.string().min(1),
});

/** A variant axis. */
export const VariantAxisSchema: z.ZodType<VariantAxis> = z.looseObject({
	id: IdSchema,
	name: z.string().min(1),
	options: z.array(VariantAxisOptionSchema).min(1),
});

/**
 * An override patch targeting one definition node: prop values plus
 * the universal authoring families.
 */
export const NodeOverridePatchSchema: z.ZodType<NodeOverridePatch> =
	z.looseObject({
		props: z.record(z.string(), JsonValueSchema).optional(),
		layout: responsiveValueSchema(LayoutSpecSchema).optional(),
		style: responsiveValueSchema(VisualStyleSpecSchema).optional(),
		typography: responsiveValueSchema(TypographySpecSchema).optional(),
		hidden: responsiveValueSchema(z.boolean()).optional(),
	});

/**
 * One variant: a full axis selection plus definition-node patches.
 * Patch keys are bare definition node ids — never the runtime
 * composite form (contract freeze CORE-P0-001 §1.1).
 */
export const ComponentVariantSchema: z.ZodType<ComponentVariant> =
	z.looseObject({
		id: IdSchema,
		name: z.string().min(1).optional(),
		selection: z.record(IdSchema, IdSchema),
		patch: z.record(PersistedNodeIdSchema, NodeOverridePatchSchema),
	});
