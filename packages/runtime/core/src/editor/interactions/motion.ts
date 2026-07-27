/**
 * @file Motion normalization — the pure half of the preview runtime
 * (PLAN-0020 CORE-P3-002; ED-MOTION-001..003; DD-0019 §16).
 *
 * Turns an `animate` action's declarative steps into a flat, ordered
 * schedule of timed property writes. Keeping this pure and React-free
 * means the parts worth arguing about — composition order, stagger
 * arithmetic, and the reduced-motion transform — are unit-testable
 * without a DOM, an animation library, or a running editor.
 *
 * The runtime half (subscribing to triggers, driving `motion`, and
 * disposing on preview exit) sits in `react/editor/interactions/`.
 *
 * ### Reduced motion (ED-MOTION-003)
 *
 * §16: reduced-motion "removes transforms and limits optional opacity
 * crossfades to 150 ms". That is implemented literally — transform
 * properties are **dropped** rather than instantly applied, because
 * snapping an element to a translated position is a different visual
 * result, not a gentler one. Opacity survives, clamped to 150 ms,
 * since a fade is the one motion the guidance keeps.
 */

import type {
	AnimatableProperty,
	AnimationStep,
	InteractionAction,
	MotionTransition,
} from "@anvilkit/contracts/editor";

/**
 * Properties that move an element in space. Reduced motion drops
 * these; everything else (colors, radius, opacity) is a paint change
 * and is kept.
 */
const TRANSFORM_PROPERTIES: ReadonlySet<AnimatableProperty> = new Set([
	"translateX",
	"translateY",
	"scale",
	"rotate",
]);

/** §16's cap on an opacity crossfade under reduced motion. */
export const REDUCED_MOTION_MAX_DURATION_MS = 150;

/** One resolved property write, positioned on the timeline. */
export interface MotionScheduleEntry {
	readonly targetNodeId: string;
	/** Milliseconds from the interaction firing to this step starting. */
	readonly startMs: number;
	readonly to: Readonly<Partial<Record<AnimatableProperty, string | number>>>;
	readonly transition: MotionTransition;
}

/** A fully normalized animation, ready to hand to the runtime. */
export interface MotionSchedule {
	readonly entries: readonly MotionScheduleEntry[];
	/** Total wall-clock span, for disposal timers and the timeline UI. */
	readonly durationMs: number;
}

/**
 * How long one transition occupies the timeline.
 *
 * A spring has no intrinsic duration — it settles. `motion` decides
 * the real settle time at run time, so the schedule uses a fixed
 * nominal span purely for *ordering* sequenced steps and sizing the
 * disposal timer. It is not a claim about when the spring visually
 * stops.
 */
export function transitionSpanMs(transition: MotionTransition): number {
	const delay = transition.delayMs ?? 0;
	return transition.type === "tween"
		? delay + transition.durationMs
		: delay + SPRING_NOMINAL_MS;
}

const SPRING_NOMINAL_MS = 400;

/** Drop transform targets and clamp what remains (ED-MOTION-003). */
function reduceStep(step: AnimationStep): AnimationStep | null {
	const kept = Object.entries(step.to).filter(
		([property]) => !TRANSFORM_PROPERTIES.has(property as AnimatableProperty),
	);
	if (kept.length === 0) return null;

	const to = Object.fromEntries(kept) as AnimationStep["to"];
	// Only the crossfade is capped: §16 limits "optional opacity
	// crossfades", and clamping a color transition would change a
	// paint result the author asked for without reducing motion.
	const capped =
		"opacity" in to && step.transition.type === "tween"
			? {
					...step.transition,
					durationMs: Math.min(
						step.transition.durationMs,
						REDUCED_MOTION_MAX_DURATION_MS,
					),
				}
			: step.transition;
	return { to, transition: capped };
}

/**
 * Normalize an `animate` action into a schedule.
 *
 * `sequence` starts each step when the previous one ends; `parallel`
 * starts them together. `staggerMs` offsets each *target* — not each
 * step — so a three-target stagger reads as one wave rather than
 * nine independently drifting animations.
 *
 * Returns an empty schedule for non-`animate` actions and, under
 * reduced motion, for an animation that was purely transforms.
 */
export function buildMotionSchedule(
	action: InteractionAction,
	options: { readonly reducedMotion?: boolean } = {},
): MotionSchedule {
	if (action.type !== "animate") return EMPTY_SCHEDULE;

	const steps = options.reducedMotion
		? action.steps
				.map(reduceStep)
				.filter((step): step is AnimationStep => step !== null)
		: action.steps;
	if (steps.length === 0 || action.targetNodeIds.length === 0) {
		return EMPTY_SCHEDULE;
	}

	const stagger = action.staggerMs ?? 0;
	const entries: MotionScheduleEntry[] = [];
	let durationMs = 0;

	action.targetNodeIds.forEach((targetNodeId, targetIndex) => {
		const offset = stagger * targetIndex;
		let cursor = offset;
		for (const step of steps) {
			entries.push({
				targetNodeId,
				startMs: action.composition === "sequence" ? cursor : offset,
				to: step.to,
				transition: step.transition,
			});
			const span = transitionSpanMs(step.transition);
			if (action.composition === "sequence") {
				cursor += span;
				durationMs = Math.max(durationMs, cursor);
			} else {
				durationMs = Math.max(durationMs, offset + span);
			}
		}
	});

	return { entries, durationMs };
}

const EMPTY_SCHEDULE: MotionSchedule = { entries: [], durationMs: 0 };

/**
 * Schedules for every action of an interaction, in action order.
 *
 * Non-`animate` actions yield empty schedules rather than being
 * filtered out, so an index into this array still lines up with the
 * interaction's `actions` array — the timeline editor (CORE-P3-003)
 * relies on that correspondence.
 */
export function buildInteractionSchedules(
	actions: readonly InteractionAction[],
	options: { readonly reducedMotion?: boolean } = {},
): readonly MotionSchedule[] {
	return actions.map((action) => buildMotionSchedule(action, options));
}
