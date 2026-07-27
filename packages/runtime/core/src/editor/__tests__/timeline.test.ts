/**
 * Timeline model (PLAN-0020 CORE-P3-003; ED-TIMELINE-001).
 */

import type {
	AnimationStep,
	InteractionAction,
	MotionTransition,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	buildInteractionTimeline,
	reorderActions,
} from "../interactions/timeline.js";

const tween = (durationMs: number): MotionTransition => ({
	type: "tween",
	durationMs,
	easing: [0.4, 0, 0.2, 1],
});

const spring: MotionTransition = {
	type: "spring",
	stiffness: 100,
	damping: 10,
	mass: 1,
};

const step = (
	to: AnimationStep["to"],
	transition: MotionTransition = tween(100),
): AnimationStep => ({ to, transition });

function animate(
	patch: Partial<Extract<InteractionAction, { type: "animate" }>> = {},
): InteractionAction {
	return {
		type: "animate",
		targetNodeIds: ["a"],
		steps: [step({ opacity: 1 })],
		composition: "sequence",
		...patch,
	};
}

describe("buildInteractionTimeline", () => {
	it("gives every action a row, in order", () => {
		const timeline = buildInteractionTimeline([
			{ type: "url", url: "https://example.com" },
			animate(),
		]);
		expect(timeline.rows.map((r) => r.actionIndex)).toEqual([0, 1]);
		expect(timeline.rows.map((r) => r.actionType)).toEqual(["url", "animate"]);
	});

	it("keeps a row for non-animating actions with no tracks", () => {
		// Hiding them would make the timeline disagree with the action
		// list the author is editing.
		const timeline = buildInteractionTimeline([
			{ type: "scroll", targetNodeId: "n2" },
		]);
		expect(timeline.rows).toHaveLength(1);
		expect(timeline.rows[0]?.tracks).toEqual([]);
		expect(timeline.rows[0]?.durationMs).toBe(0);
	});

	it("groups segments into one track per target", () => {
		const timeline = buildInteractionTimeline([
			animate({
				targetNodeIds: ["a", "b"],
				steps: [step({ opacity: 0 }), step({ opacity: 1 })],
			}),
		]);
		const tracks = timeline.rows[0]?.tracks ?? [];
		expect(tracks.map((t) => t.targetNodeId)).toEqual(["a", "b"]);
		expect(tracks[0]?.segments).toHaveLength(2);
	});

	it("positions sequenced segments end-to-end", () => {
		const timeline = buildInteractionTimeline([
			animate({
				steps: [
					step({ opacity: 0 }, tween(100)),
					step({ opacity: 1 }, tween(50)),
				],
			}),
		]);
		const segments = timeline.rows[0]?.tracks[0]?.segments ?? [];
		expect(segments.map((s) => [s.startMs, s.endMs])).toEqual([
			[0, 100],
			[100, 150],
		]);
	});

	it("records the animated properties per segment", () => {
		const timeline = buildInteractionTimeline([
			animate({ steps: [step({ opacity: 1, radius: 4 })] }),
		]);
		expect(timeline.rows[0]?.tracks[0]?.segments[0]?.properties).toEqual([
			"opacity",
			"radius",
		]);
	});

	it("marks spring segments as nominally ended", () => {
		// A spring settles; the editor must not imply a hard stop.
		const timeline = buildInteractionTimeline([
			animate({ steps: [step({ opacity: 1 }, spring)] }),
		]);
		expect(timeline.rows[0]?.tracks[0]?.segments[0]?.nominalEnd).toBe(true);
	});

	it("reports the longest row as the timeline duration", () => {
		const timeline = buildInteractionTimeline([
			animate({ steps: [step({ opacity: 1 }, tween(50))] }),
			animate({ steps: [step({ opacity: 1 }, tween(400))] }),
		]);
		expect(timeline.durationMs).toBe(400);
	});

	it("reflects the reduced-motion transform rather than the authored steps", () => {
		// The timeline must show what will actually run.
		const timeline = buildInteractionTimeline(
			[animate({ steps: [step({ translateX: 20 })] })],
			{ reducedMotion: true },
		);
		expect(timeline.rows[0]?.tracks).toEqual([]);
		expect(timeline.durationMs).toBe(0);
	});
});

describe("reorderActions", () => {
	const a: InteractionAction = { type: "url", url: "https://a.example" };
	const b: InteractionAction = { type: "url", url: "https://b.example" };
	const c: InteractionAction = { type: "url", url: "https://c.example" };

	it("moves an action forward", () => {
		expect(reorderActions([a, b, c], 0, 2)).toEqual([b, c, a]);
	});

	it("moves an action backward", () => {
		expect(reorderActions([a, b, c], 2, 0)).toEqual([c, a, b]);
	});

	it("returns the input unchanged for a no-op or out-of-range move", () => {
		const actions = [a, b, c];
		expect(reorderActions(actions, 1, 1)).toBe(actions);
		expect(reorderActions(actions, -1, 0)).toBe(actions);
		expect(reorderActions(actions, 0, 9)).toBe(actions);
	});

	it("does not mutate the input array", () => {
		const actions = [a, b, c];
		reorderActions(actions, 0, 2);
		expect(actions).toEqual([a, b, c]);
	});
});
