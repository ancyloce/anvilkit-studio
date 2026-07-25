/**
 * @file Interaction trigger/action/transition schemas
 * (PLAN-0020 CORE-P0-005E; DD-0019 §16).
 *
 * The URL value schema is restricted to `http`, `https`, `mailto`,
 * and `tel` — `javascript:` (and every other scheme) is
 * unrepresentable at parse time, not merely discouraged.
 */

import type {
	InteractionAction,
	InteractionTrigger,
	InteractionV1,
	MotionTransition,
} from "@anvilkit/contracts/editor";
import { z } from "zod";
import { SafeConditionSchema } from "./bindings.js";
import {
	addLimitIssue,
	FiniteNumberSchema,
	IdSchema,
	limitedRecordSchema,
	NonNegativeFiniteNumberSchema,
	PersistedNodeIdSchema,
	UnitIntervalSchema,
} from "./primitives.js";

/** An interaction-action URL: http/https/mailto/tel only. */
export const SafeUrlSchema = z.string().refine(
	(value) => {
		const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(value)?.[1];
		if (scheme === undefined) {
			return false;
		}
		const normalized = scheme.toLowerCase();
		return (
			normalized === "http" ||
			normalized === "https" ||
			normalized === "mailto" ||
			normalized === "tel"
		);
	},
	{ message: "url scheme must be http, https, mailto, or tel" },
);

/** Interaction trigger (DD-0019 §16, verbatim shape). */
export const InteractionTriggerSchema: z.ZodType<InteractionTrigger> =
	z.discriminatedUnion("type", [
		z.looseObject({ type: z.literal("click") }),
		z.looseObject({
			type: z.literal("hover"),
			phase: z.enum(["enter", "leave"]),
		}),
		z.looseObject({ type: z.literal("focus"), phase: z.enum(["in", "out"]) }),
		z.looseObject({
			type: z.literal("viewport"),
			phase: z.enum(["enter", "leave"]),
			threshold: UnitIntervalSchema,
		}),
		z.looseObject({
			type: z.literal("pageLoad"),
			delayMs: NonNegativeFiniteNumberSchema.optional(),
		}),
	]);

/** Cubic-bezier easing tuple. */
export const CubicBezierSchema = z.tuple([
	FiniteNumberSchema,
	FiniteNumberSchema,
	FiniteNumberSchema,
	FiniteNumberSchema,
]);

/** Motion transition (DD-0019 §16, verbatim shape). */
export const MotionTransitionSchema: z.ZodType<MotionTransition> =
	z.discriminatedUnion("type", [
		z.looseObject({
			type: z.literal("tween"),
			durationMs: NonNegativeFiniteNumberSchema,
			easing: CubicBezierSchema,
			delayMs: NonNegativeFiniteNumberSchema.optional(),
		}),
		z.looseObject({
			type: z.literal("spring"),
			stiffness: NonNegativeFiniteNumberSchema,
			damping: NonNegativeFiniteNumberSchema,
			mass: NonNegativeFiniteNumberSchema,
			delayMs: NonNegativeFiniteNumberSchema.optional(),
		}),
	]);

/** The P0 animatable property set. */
export const AnimatablePropertySchema = z.enum([
	"opacity",
	"translateX",
	"translateY",
	"scale",
	"rotate",
	"backgroundColor",
	"textColor",
	"borderColor",
	"radius",
]);

/** One animation step. */
export const AnimationStepSchema = z.looseObject({
	to: z.record(
		AnimatablePropertySchema,
		z.union([z.string(), FiniteNumberSchema]),
	),
	transition: MotionTransitionSchema,
});

/** The closed action set (ED-INT-002 families). */
export const InteractionActionSchema: z.ZodType<InteractionAction> =
	z.discriminatedUnion("type", [
		z.looseObject({ type: z.literal("navigate"), pageId: IdSchema }),
		z.looseObject({
			type: z.literal("url"),
			url: SafeUrlSchema,
			newTab: z.boolean().optional(),
		}),
		z.looseObject({
			type: z.literal("scroll"),
			targetNodeId: PersistedNodeIdSchema,
			behavior: z.enum(["smooth", "instant"]).optional(),
		}),
		z.looseObject({
			type: z.literal("visibility"),
			targetNodeId: PersistedNodeIdSchema,
			operation: z.enum(["show", "hide", "toggle"]),
			transition: MotionTransitionSchema.optional(),
		}),
		z.looseObject({
			type: z.literal("variant"),
			targetNodeId: PersistedNodeIdSchema,
			selection: z.record(IdSchema, IdSchema),
		}),
		z.looseObject({
			type: z.literal("animate"),
			targetNodeIds: z.array(PersistedNodeIdSchema).min(1),
			steps: z.array(AnimationStepSchema).min(1),
			composition: z.enum(["sequence", "parallel"]),
			staggerMs: NonNegativeFiniteNumberSchema.optional(),
		}),
	]) as unknown as z.ZodType<InteractionAction>;

/** A stored interaction (verbatim shape + the ≤100 actions cap). */
export const InteractionSchema: z.ZodType<InteractionV1> = z
	.looseObject({
		version: z.literal("1"),
		id: IdSchema,
		name: z.string(),
		sourceNodeId: PersistedNodeIdSchema,
		trigger: InteractionTriggerSchema,
		conditions: z.array(SafeConditionSchema).optional(),
		actions: z.array(InteractionActionSchema),
		enabled: z.boolean(),
	})
	.superRefine((interaction, ctx) =>
		addLimitIssue(ctx, "actionsPerInteraction", interaction.actions.length),
	) as unknown as z.ZodType<InteractionV1>;

/** The document interaction collection (≤1,000 interactions). */
export const InteractionCollectionSchema = limitedRecordSchema(
	InteractionSchema,
	"interactions",
);
