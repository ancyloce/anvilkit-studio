/**
 * Action assembly for the §16 families (PLAN-0020 CORE-P3-001;
 * ED-INT-002).
 *
 * `buildAction` is the gate that keeps an incomplete action out of the
 * command pipeline entirely, so the incompleteness cases matter as much
 * as the happy ones: a `scroll` with no target or a `variant` with no
 * option must return `null` rather than a half-formed action that
 * validation has to catch later.
 */

import { describe, expect, it } from "vitest";
import {
	type ActionDraft,
	buildAction,
	EMPTY_ACTION_DRAFT,
} from "../interactions/ActionEditor.js";

const draft = (patch: Partial<ActionDraft>): ActionDraft => ({
	...EMPTY_ACTION_DRAFT,
	...patch,
});

describe("buildAction — url", () => {
	it("builds a plain link", () => {
		expect(
			buildAction(draft({ kind: "url", url: " https://a.example " })),
		).toEqual({ type: "url", url: "https://a.example" });
	});

	it("omits newTab rather than sending false", () => {
		// The contract marks it optional; an explicit `false` is noise in
		// the persisted document.
		const action = buildAction(
			draft({ kind: "url", url: "https://a.example" }),
		);
		expect(action).not.toHaveProperty("newTab");
	});

	it("sets newTab when asked", () => {
		expect(
			buildAction(
				draft({ kind: "url", url: "https://a.example", newTab: true }),
			),
		).toMatchObject({ newTab: true });
	});

	it("is incomplete without a URL", () => {
		expect(buildAction(draft({ kind: "url", url: "   " }))).toBeNull();
	});
});

describe("buildAction — navigate", () => {
	it("builds a page navigation", () => {
		expect(buildAction(draft({ kind: "navigate", pageId: " p1 " }))).toEqual({
			type: "navigate",
			pageId: "p1",
		});
	});

	it("is incomplete without a page", () => {
		expect(buildAction(draft({ kind: "navigate" }))).toBeNull();
	});
});

describe("buildAction — scroll and visibility", () => {
	it("builds a scroll with its behaviour", () => {
		expect(
			buildAction(
				draft({
					kind: "scroll",
					targetNodeId: "n2",
					scrollBehavior: "instant",
				}),
			),
		).toEqual({ type: "scroll", targetNodeId: "n2", behavior: "instant" });
	});

	it("builds each visibility operation", () => {
		for (const operation of ["show", "hide", "toggle"] as const) {
			expect(
				buildAction(
					draft({
						kind: "visibility",
						targetNodeId: "n2",
						visibility: operation,
					}),
				),
			).toEqual({ type: "visibility", targetNodeId: "n2", operation });
		}
	});

	it("is incomplete without a target", () => {
		expect(buildAction(draft({ kind: "scroll" }))).toBeNull();
		expect(buildAction(draft({ kind: "visibility" }))).toBeNull();
	});
});

describe("buildAction — variant", () => {
	it("builds an axis/option selection", () => {
		expect(
			buildAction(
				draft({
					kind: "variant",
					targetNodeId: "n2",
					axisId: "size",
					optionId: "lg",
				}),
			),
		).toEqual({
			type: "variant",
			targetNodeId: "n2",
			selection: { size: "lg" },
		});
	});

	it("is incomplete until axis and option are both chosen", () => {
		// A partial selection matches no combination and would silently
		// render the base variant.
		expect(
			buildAction(
				draft({ kind: "variant", targetNodeId: "n2", axisId: "size" }),
			),
		).toBeNull();
		expect(
			buildAction(
				draft({ kind: "variant", targetNodeId: "n2", optionId: "lg" }),
			),
		).toBeNull();
	});
});

describe("buildAction — animate", () => {
	it("builds a single tween step", () => {
		expect(
			buildAction(
				draft({
					kind: "animate",
					targetNodeId: "n2",
					property: "opacity",
					to: "0",
					durationMs: "250",
				}),
			),
		).toEqual({
			type: "animate",
			targetNodeIds: ["n2"],
			composition: "sequence",
			steps: [
				{
					to: { opacity: 0 },
					transition: {
						type: "tween",
						durationMs: 250,
						easing: [0.4, 0, 0.2, 1],
					},
				},
			],
		});
	});

	it("keeps a colour value as a string", () => {
		// Numeric parsing must not turn `#ff0000` into NaN.
		const action = buildAction(
			draft({
				kind: "animate",
				targetNodeId: "n2",
				property: "backgroundColor",
				to: "#ff0000",
			}),
		);
		expect(action).toMatchObject({
			steps: [{ to: { backgroundColor: "#ff0000" } }],
		});
	});

	it("is incomplete without a target or with a non-numeric duration", () => {
		expect(buildAction(draft({ kind: "animate" }))).toBeNull();
		expect(
			buildAction(
				draft({ kind: "animate", targetNodeId: "n2", durationMs: "soon" }),
			),
		).toBeNull();
	});
});

describe("buildAction — coverage", () => {
	it("handles every offered family", () => {
		// A family added to the picker without a builder would silently
		// produce `null` and look like an incomplete form forever.
		const complete: Record<string, ActionDraft> = {
			url: draft({ kind: "url", url: "https://a.example" }),
			navigate: draft({ kind: "navigate", pageId: "p1" }),
			scroll: draft({ kind: "scroll", targetNodeId: "n2" }),
			visibility: draft({ kind: "visibility", targetNodeId: "n2" }),
			variant: draft({
				kind: "variant",
				targetNodeId: "n2",
				axisId: "size",
				optionId: "lg",
			}),
			animate: draft({ kind: "animate", targetNodeId: "n2" }),
		};
		for (const [kind, value] of Object.entries(complete)) {
			expect(buildAction(value), kind).not.toBeNull();
		}
	});
});
