/**
 * `TimelinePanel` — ordered multi-step visualisation
 * (PLAN-0020 CORE-P3-003; ED-TIMELINE-001).
 *
 * The property worth pinning is that the panel cannot disagree with the
 * runtime: both derive from `buildMotionSchedule`, so what is drawn is
 * what will play — including under reduced motion.
 */

import type {
	AnimationStep,
	Interaction,
	InteractionAction,
	MotionTransition,
} from "@anvilkit/contracts/editor";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import { TimelinePanel } from "../interactions/timeline/TimelinePanel.js";

const tween = (durationMs: number): MotionTransition => ({
	type: "tween",
	durationMs,
	easing: [0.4, 0, 0.2, 1],
});

const step = (
	to: AnimationStep["to"],
	transition: MotionTransition = tween(200),
): AnimationStep => ({ to, transition });

function interaction(actions: readonly InteractionAction[]): Interaction {
	return {
		version: "1",
		id: "i1",
		name: "Demo",
		sourceNodeId: "n1",
		enabled: true,
		trigger: { type: "click" },
		actions,
	};
}

function show(value: Interaction): void {
	render(
		<EditorI18nProvider>
			<TimelinePanel interaction={value} />
		</EditorI18nProvider>,
	);
}

function setReducedMotion(matches: boolean): void {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		configurable: true,
		value: vi.fn().mockImplementation((query: string) => ({
			matches,
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})),
	});
}

beforeEach(() => {
	setReducedMotion(false);
});

// The react-library preset runs with `globals: false`, so RTL's
// auto-cleanup is OFF.
afterEach(() => {
	cleanup();
});

describe("TimelinePanel", () => {
	it("gives every action a row, in order", () => {
		show(
			interaction([
				{ type: "url", url: "https://a.example" },
				{
					type: "animate",
					targetNodeIds: ["n2"],
					composition: "sequence",
					steps: [step({ opacity: 0 })],
				},
			]),
		);
		const rows = screen.getAllByTestId("ak-timeline-row");
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.dataset.actionType)).toEqual(["url", "animate"]);
	});

	it("marks a non-animating action as instant rather than hiding it", () => {
		// Hiding it would make the timeline disagree with the action list.
		show(interaction([{ type: "scroll", targetNodeId: "n2" }]));
		expect(screen.getByTestId("ak-timeline-instant")).toBeTruthy();
		expect(screen.queryByTestId("ak-timeline-track")).toBeNull();
	});

	it("draws one track per animated target", () => {
		show(
			interaction([
				{
					type: "animate",
					targetNodeIds: ["n2", "n3"],
					composition: "parallel",
					steps: [step({ opacity: 1 })],
				},
			]),
		);
		expect(
			screen.getAllByTestId("ak-timeline-track").map((t) => t.dataset.target),
		).toEqual(["n2", "n3"]);
	});

	it("positions sequenced segments in order along the axis", () => {
		show(
			interaction([
				{
					type: "animate",
					targetNodeIds: ["n2"],
					composition: "sequence",
					steps: [
						step({ opacity: 0 }, tween(100)),
						step({ opacity: 1 }, tween(100)),
					],
				},
			]),
		);
		const segments = screen.getAllByTestId("ak-timeline-segment");
		expect(segments).toHaveLength(2);
		// Second step starts halfway through a 200 ms timeline.
		expect(segments[1]?.style.left).toBe("50%");
	});

	it("marks a spring's end as nominal", () => {
		// A spring settles; the panel must not imply a hard stop.
		show(
			interaction([
				{
					type: "animate",
					targetNodeIds: ["n2"],
					composition: "sequence",
					steps: [
						step(
							{ opacity: 1 },
							{
								type: "spring",
								stiffness: 100,
								damping: 10,
								mass: 1,
							},
						),
					],
				},
			]),
		);
		expect(screen.getByTestId("ak-timeline-segment").dataset.nominalEnd).toBe(
			"true",
		);
	});

	it("reports the total duration", () => {
		show(
			interaction([
				{
					type: "animate",
					targetNodeIds: ["n2"],
					composition: "sequence",
					steps: [step({ opacity: 1 }, tween(450))],
				},
			]),
		);
		expect(screen.getByTestId("ak-timeline").dataset.duration).toBe("450");
	});

	it("shows what will actually run under reduced motion", () => {
		// A transform-only action is dropped, not snapped — so the panel
		// must show nothing to run rather than a bar that never plays.
		setReducedMotion(true);
		show(
			interaction([
				{
					type: "animate",
					targetNodeIds: ["n2"],
					composition: "sequence",
					steps: [step({ translateX: 40 })],
				},
			]),
		);
		expect(screen.queryByTestId("ak-timeline-segment")).toBeNull();
		expect(screen.getByTestId("ak-timeline-reduced-motion")).toBeTruthy();
	});

	it("does not divide by zero for an instant-only interaction", () => {
		show(interaction([{ type: "url", url: "https://a.example" }]));
		expect(screen.getByTestId("ak-timeline").dataset.duration).toBe("0");
	});
});
