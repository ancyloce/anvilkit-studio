/**
 * @file Per-node authoring record schema
 * (PLAN-0020 CORE-P0-005B/F; DD-0019 §9.2).
 *
 * Records exist only when non-default authoring state exists
 * (invariant 3) — emptiness is a compaction concern
 * (`compactAuthoringState`), not a parse failure.
 */

import type { NodeAuthoringStateV1 } from "@anvilkit/contracts/editor";
import { z } from "zod";
import { ComponentInstanceStateSchema } from "./components.js";
import { LayoutSpecSchema } from "./layout.js";
import {
	addLimitIssue,
	IdSchema,
	PersistedNodeIdSchema,
	responsiveValueSchema,
} from "./primitives.js";
import { VisualStyleSpecSchema } from "./style.js";
import { TypographySpecSchema } from "./typography.js";

/** Explicit accessibility overrides authored on a node. */
export const AccessibilityOverrideSchema = z.looseObject({
	role: z.string().optional(),
	label: z.string().optional(),
	description: z.string().optional(),
	hidden: z.boolean().optional(),
});

/** The authoring record for one Puck node (DD-0019 §9.2, verbatim shape). */
export const NodeAuthoringStateSchema: z.ZodType<NodeAuthoringStateV1> =
	z.looseObject({
		version: z.literal("1"),
		name: z.string().optional(),
		hidden: responsiveValueSchema(z.boolean()).optional(),
		locked: z.boolean().optional(),
		layout: responsiveValueSchema(LayoutSpecSchema).optional(),
		style: responsiveValueSchema(VisualStyleSpecSchema).optional(),
		typography: responsiveValueSchema(TypographySpecSchema).optional(),
		styleRefs: responsiveValueSchema(z.array(IdSchema)).optional(),
		interactionRefs: z.array(IdSchema).optional(),
		bindingRefs: z.array(IdSchema).optional(),
		componentInstance: ComponentInstanceStateSchema.optional(),
		accessibility: AccessibilityOverrideSchema.optional(),
	});

/**
 * The document node-record collection (≤5,000 records; keys are
 * persisted Puck node ids, never the runtime composite form).
 */
export const NodeCollectionSchema = z
	.record(PersistedNodeIdSchema, NodeAuthoringStateSchema)
	.superRefine((record, ctx) =>
		addLimitIssue(ctx, "nodeRecords", Object.keys(record).length),
	);
