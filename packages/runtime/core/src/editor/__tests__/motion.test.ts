/**
 * Motion normalization — composition, stagger, and the reduced-motion
 * transform (PLAN-0020 CORE-P3-002; ED-MOTION-001..003; DD-0019 §16).
 */

import type {
	AnimationStep,
	InteractionAction,
	MotionTransition,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	buildInteractionSchedules,
	buildMotionSchedule,
	REDUCED_MOTION_MAX_DURATION_MS,
	transitionSpanMs,
} from "../interactions/motion.js";

const tween = (durationMs: number, delayMs?: number): MotionTransition => ({
	type: "tween",
	durationMs,
	easing: [0.4, 0, 0.2, 1],
	...(delayMs === undefined ? {} : { delayMs }),
});

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

describe("transitionSpanMs", () => {
	it("adds delay to a tween's duration", () => {
		expect(transitionSpanMs(tween(200, 50))).toBe(250);
	});

	it("gives a spring a nominal span for ordering only", () => {
		const spring: MotionTransition = {
			type: "spring",
			stiffness: 100,
			damping: 10,
			mass: 1,
			delayMs: 25,
		};
		expect(transitionSpanMs(spring)).toBeGreaterThan(25);
	});
});

describe("buildMotionSchedule — composition", () => {
	it("starts sequenced steps when the previous one ends", () => {
		const schedule = buildMotionSchedule(
			animate({
				steps: [
					step({ opacity: 0 }, tween(100)),
					step({ opacity: 1 }, tween(50)),
				],
			}),
		);
		expect(schedule.entries.map((e) => e.startMs)).toEqual([0, 100]);
		expect(schedule.durationMs).toBe(150);
	});

	it("starts parallel steps together", () => {
		const schedule = buildMotionSchedule(
			animate({
				composition: "parallel",
				steps: [
					step({ opacity: 0 }, tween(100)),
					step({ radius: 4 }, tween(50)),
				],
			}),
		);
		expect(schedule.entries.map((e) => e.startMs)).toEqual([0, 0]);
		// Parallel duration is the longest step, not the sum.
		expect(schedule.durationMs).toBe(100);
	});

	it("offsets each target by the stagger, not each step", () => {
		const schedule = buildMotionSchedule(
			animate({
				targetNodeIds: ["a", "b", "c"],
				composition: "parallel",
				staggerMs: 30,
				steps: [step({ opacity: 1 }, tween(100))],
			}),
		);
		expect(schedule.entries.map((e) => e.startMs)).toEqual([0, 30, 60]);
		expect(schedule.durationMs).toBe(160);
	});

	it("staggers targets while sequencing their own steps", () => {
		const schedule = buildMotionSchedule(
			animate({
				targetNodeIds: ["a", "b"],
				staggerMs: 20,
				steps: [
					step({ opacity: 0 }, tween(10)),
					step({ opacity: 1 }, tween(10)),
				],
			}),
		);
		expect(
			schedule.entries.map((e) => [e.targetNodeId, e.startMs] as const),
		).toEqual([
			["a", 0],
			["a", 10],
			["b", 20],
			["b", 30],
		]);
	});

	it("returns an empty schedule for a non-animate action", () => {
		expect(
			buildMotionSchedule({ type: "url", url: "https://example.com" }),
		).toEqual({ entries: [], durationMs: 0 });
	});

	it("returns an empty schedule when there are no targets", () => {
		expect(buildMotionSchedule(animate({ targetNodeIds: [] })).entries).toEqual(
			[],
		);
	});
});

describe("buildMotionSchedule — reduced motion (ED-MOTION-003)", () => {
	it("drops transform properties rather than snapping them", () => {
		const schedule = buildMotionSchedule(
			animate({ steps: [step({ translateX: 40, opacity: 1 })] }),
			{ reducedMotion: true },
		);
		expect(schedule.entries).toHaveLength(1);
		expect(schedule.entries[0]?.to).toEqual({ opacity: 1 });
	});

	it("drops a step that was purely transforms", () => {
		const schedule = buildMotionSchedule(
			animate({ steps: [step({ translateY: 10, scale: 2, rotate: 90 })] }),
			{ reducedMotion: true },
		);
		expect(schedule.entries).toEqual([]);
		expect(schedule.durationMs).toBe(0);
	});

	it("caps an opacity crossfade at 150 ms", () => {
		const schedule = buildMotionSchedule(
			animate({ steps: [step({ opacity: 1 }, tween(900))] }),
			{ reducedMotion: true },
		);
		const transition = schedule.entries[0]?.transition;
		expect(transition?.type).toBe("tween");
		if (transition?.type !== "tween") return;
		expect(transition.durationMs).toBe(REDUCED_MOTION_MAX_DURATION_MS);
	});

	it("leaves a shorter crossfade alone", () => {
		const schedule = buildMotionSchedule(
			animate({ steps: [step({ opacity: 1 }, tween(80))] }),
			{ reducedMotion: true },
		);
		const transition = schedule.entries[0]?.transition;
		expect(transition?.type === "tween" && transition.durationMs).toBe(80);
	});

	it("keeps colour and radius changes at their authored duration", () => {
		// These are paint changes, not motion — capping them would alter
		// a result the author asked for without reducing any movement.
		const schedule = buildMotionSchedule(
			animate({
				steps: [step({ backgroundColor: "#fff", radius: 8 }, tween(600))],
			}),
			{ reducedMotion: true },
		);
		const transition = schedule.entries[0]?.transition;
		expect(transition?.type === "tween" && transition.durationMs).toBe(600);
	});

	it("is a no-op for an animation that never moved anything", () => {
		const action = animate({ steps: [step({ opacity: 1 }, tween(80))] });
		expect(buildMotionSchedule(action, { reducedMotion: true })).toEqual(
			buildMotionSchedule(action),
		);
	});
});

describe("buildInteractionSchedules", () => {
	it("keeps index correspondence with the actions array", () => {
		const schedules = buildInteractionSchedules([
			{ type: "url", url: "https://example.com" },
			animate(),
		]);
		expect(schedules).toHaveLength(2);
		// The non-animate action keeps its slot so the timeline editor's
		// index into `actions` stays valid.
		expect(schedules[0]?.entries).toEqual([]);
		expect(schedules[1]?.entries).toHaveLength(1);
	});
});
