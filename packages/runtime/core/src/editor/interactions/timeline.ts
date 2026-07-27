/**
 * @file Timeline model for multi-step actions (PLAN-0020 CORE-P3-003;
 * ED-TIMELINE-001; DD-0019 §16).
 *
 * Turns an interaction's actions into ordered, positioned tracks the
 * editor can draw and the author can reason about. Purely derived —
 * the timeline stores nothing of its own, so it can never disagree
 * with the interaction it visualises.
 *
 * Built on `buildMotionSchedule` rather than re-walking the action
 * set: the timeline must show exactly what the runtime will do,
 * including the reduced-motion transform. A separate traversal here
 * would eventually drift and show the author an animation that no
 * longer runs.
 */

import type {
	AnimatableProperty,
	InteractionAction,
	MotionTransition,
} from "@anvilkit/contracts/editor";
import { buildMotionSchedule, transitionSpanMs } from "./motion.js";

/** One drawable segment on a track. */
export interface TimelineSegment {
	readonly startMs: number;
	readonly endMs: number;
	/** Properties this segment animates, in declaration order. */
	readonly properties: readonly AnimatableProperty[];
	readonly transition: MotionTransition;
	/**
	 * True for a spring, whose end is nominal — the runtime settles it
	 * rather than stopping at a fixed time. The editor should draw
	 * these as open-ended rather than implying a hard stop.
	 */
	readonly nominalEnd: boolean;
}

/** All segments belonging to one animated node. */
export interface TimelineTrack {
	readonly targetNodeId: string;
	readonly segments: readonly TimelineSegment[];
}

/** One action's row in the timeline. */
export interface TimelineRow {
	/** Index into the interaction's `actions` array. */
	readonly actionIndex: number;
	readonly actionType: InteractionAction["type"];
	/** Empty for non-animating actions, which still occupy a row. */
	readonly tracks: readonly TimelineTrack[];
	readonly durationMs: number;
}

/** The whole interaction, laid out. */
export interface InteractionTimeline {
	readonly rows: readonly TimelineRow[];
	/** Longest row — the timeline's drawn width. */
	readonly durationMs: number;
}

/**
 * Build the timeline for an interaction's actions.
 *
 * Non-animating actions (navigate, url, scroll, visibility, variant)
 * keep a row with no tracks. They are real steps an author ordered and
 * hiding them would make the timeline disagree with the action list —
 * the row is the honest representation of "this happens here, but has
 * no duration to draw".
 */
export function buildInteractionTimeline(
	actions: readonly InteractionAction[],
	options: { readonly reducedMotion?: boolean } = {},
): InteractionTimeline {
	const rows = actions.map((action, actionIndex): TimelineRow => {
		const schedule = buildMotionSchedule(action, options);
		const byTarget = new Map<string, TimelineSegment[]>();

		for (const entry of schedule.entries) {
			const span = transitionSpanMs(entry.transition);
			const segment: TimelineSegment = {
				startMs: entry.startMs,
				endMs: entry.startMs + span,
				properties: Object.keys(entry.to) as AnimatableProperty[],
				transition: entry.transition,
				nominalEnd: entry.transition.type === "spring",
			};
			const existing = byTarget.get(entry.targetNodeId);
			if (existing === undefined) {
				byTarget.set(entry.targetNodeId, [segment]);
			} else {
				existing.push(segment);
			}
		}

		return {
			actionIndex,
			actionType: action.type,
			tracks: [...byTarget.entries()].map(([targetNodeId, segments]) => ({
				targetNodeId,
				segments,
			})),
			durationMs: schedule.durationMs,
		};
	});

	return {
		rows,
		durationMs: rows.reduce((max, row) => Math.max(max, row.durationMs), 0),
	};
}

/**
 * Reorder one action within an interaction.
 *
 * Returned as a new array for the caller to submit as an
 * `interaction.create` upsert — this module performs no commits, so
 * reordering cannot bypass validation or history.
 *
 * Out-of-range indices return the input unchanged rather than
 * throwing: a drag that lands outside the list is a no-op, not an
 * error worth interrupting the author with.
 */
export function reorderActions(
	actions: readonly InteractionAction[],
	from: number,
	to: number,
): readonly InteractionAction[] {
	if (
		from === to ||
		from < 0 ||
		to < 0 ||
		from >= actions.length ||
		to >= actions.length
	) {
		return actions;
	}
	const next = [...actions];
	const [moved] = next.splice(from, 1);
	if (moved === undefined) return actions;
	next.splice(to, 0, moved);
	return next;
}
