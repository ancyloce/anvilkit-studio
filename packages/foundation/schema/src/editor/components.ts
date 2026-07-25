/**
 * @file Component definition and instance schemas
 * (PLAN-0020 CORE-P0-005D; DD-0019 §14.2; DD-DEC-009).
 *
 * Identifier rules encode exactly the CORE-P0-001 freeze: persistent
 * ids only, bare definition node ids as override keys, and the
 * runtime composite `${instanceNodeId}::${definitionNodeId}` form
 * rejected everywhere. Nesting *depth* (≤10) is a graph property
 * checked by the core materializer; the schema enforces counts and
 * per-component caps.
 */

import type {
	ComponentDefinitionV1,
	ComponentInstanceState,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import { z } from "zod";
import { JsonValueSchema } from "./json.js";
import {
	addLimitIssue,
	IdSchema,
	limitedRecordSchema,
	NonNegativeIntegerSchema,
	PersistedNodeIdSchema,
	PropertyPathSegmentSchema,
} from "./primitives.js";
import {
	ComponentVariantSchema,
	NodeOverridePatchSchema,
	VariantAxisSchema,
} from "./variants.js";

/** A serializable Puck node subtree (JSON-safe props by construction). */
export const SerializablePuckNodeSchema: z.ZodType<SerializablePuckNode> =
	z.looseObject({
		type: z.string().min(1),
		props: z.record(z.string(), JsonValueSchema),
	});

/** One exposed component property (DD-0019 §14.2, verbatim shape). */
export const ComponentPropDefinitionSchema = z.looseObject({
	id: IdSchema,
	name: z.string().min(1),
	type: z.enum(["text", "number", "boolean", "image", "enum", "slot"]),
	sourcePath: z.array(PropertyPathSegmentSchema).min(1),
	defaultValue: JsonValueSchema.optional(),
});

/** A document-local component definition (verbatim shape + caps). */
export const ComponentDefinitionSchema: z.ZodType<ComponentDefinitionV1> = z
	.looseObject({
		version: z.literal("1"),
		id: IdSchema,
		name: z.string().min(1),
		root: SerializablePuckNodeSchema,
		exposedProps: z.array(ComponentPropDefinitionSchema),
		variantAxes: z.array(VariantAxisSchema),
		variants: z.array(ComponentVariantSchema),
		revision: NonNegativeIntegerSchema,
		createdAt: z.string(),
		updatedAt: z.string(),
	})
	.superRefine((definition, ctx) => {
		addLimitIssue(
			ctx,
			"variantAxesPerComponent",
			definition.variantAxes.length,
		);
		addLimitIssue(ctx, "variantsPerComponent", definition.variants.length);
		const axisIds = new Set(definition.variantAxes.map((axis) => axis.id));
		for (const [index, variant] of definition.variants.entries()) {
			for (const axisId of Object.keys(variant.selection)) {
				if (!axisIds.has(axisId)) {
					ctx.addIssue({
						code: "custom",
						message: `variant selection references unknown axis "${axisId}"`,
						path: ["variants", index, "selection", axisId],
						input: axisId,
					});
				}
			}
		}
	}) as unknown as z.ZodType<ComponentDefinitionV1>;

/** Per-instance component state (verbatim shape; frozen id rules). */
export const ComponentInstanceStateSchema: z.ZodType<ComponentInstanceState> =
	z.looseObject({
		definitionId: IdSchema,
		definitionRevision: NonNegativeIntegerSchema,
		variantSelection: z.record(IdSchema, IdSchema),
		propOverrides: z.record(IdSchema, JsonValueSchema),
		nodeOverrides: z.record(PersistedNodeIdSchema, NodeOverridePatchSchema),
	});

/** The document component-definition collection (≤500 definitions). */
export const ComponentDefinitionCollectionSchema = limitedRecordSchema(
	ComponentDefinitionSchema,
	"componentDefinitions",
);

/** Re-exported cap for consumers building materializer guards. */
export const COMPONENT_NESTING_DEPTH_LIMIT =
	EDITOR_COUNT_LIMITS.componentNestingDepth;
