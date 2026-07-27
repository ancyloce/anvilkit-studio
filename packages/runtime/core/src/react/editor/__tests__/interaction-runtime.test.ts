/**
 * Interaction runtime — trigger binding, action execution, and the §16
 * disposal guarantee (PLAN-0020 CORE-P3-002; ED-INT-002,
 * ED-MOTION-001..003).
 *
 * These assert on observable effects (listeners removed, navigation
 * refused, styles restored) rather than on "it did not throw" — a
 * runtime that silently bound nothing would pass the weaker check.
 */

import type { InteractionV1 } from "@anvilkit/contracts/editor";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createPreviewSession,
	type PreviewSession,
} from "../../../editor/index.js";
import {
	bindInteractions,
	type InteractionRuntimeDeps,
} from "../interactions/runtime.js";

vi.mock("motion", () => ({
	animate: vi.fn(() => ({ stop: vi.fn() })),
}));

function interaction(patch: Partial<InteractionV1> = {}): InteractionV1 {
	return {
		version: "1",
		id: "i1",
		name: "Go",
		sourceNodeId: "n1",
		enabled: true,
		trigger: { type: "click" },
		actions: [],
		...patch,
	};
}

let session: PreviewSession;
let source: HTMLElement;
let target: HTMLElement;
let assign: ReturnType<typeof vi.fn>;
let open: ReturnType<typeof vi.fn>;

function depsFor(): InteractionRuntimeDeps {
	const elements: Record<string, HTMLElement> = { n1: source, n2: target };
	return {
		session,
		doc: document,
		reducedMotion: false,
		getElement: (nodeId) => elements[nodeId] ?? null,
		getElements: (nodeId) =>
			elements[nodeId] === undefined ? [] : [elements[nodeId]],
	};
}

beforeEach(() => {
	session = createPreviewSession("preview");
	document.body.innerHTML = "";
	source = document.createElement("button");
	target = document.createElement("div");
	document.body.append(source, target);

	assign = vi.fn();
	open = vi.fn();
	Object.defineProperty(document, "defaultView", {
		configurable: true,
		value: {
			location: { assign },
			open,
			setTimeout: globalThis.setTimeout.bind(globalThis),
			clearTimeout: globalThis.clearTimeout.bind(globalThis),
			IntersectionObserver: undefined,
		},
	});
});

describe("bindInteractions — triggers", () => {
	it("fires on click and stops firing after disposal", () => {
		bindInteractions(
			[interaction({ actions: [{ type: "url", url: "https://a.example" }] })],
			depsFor(),
		);

		source.dispatchEvent(new MouseEvent("click"));
		expect(assign).toHaveBeenCalledOnce();

		// §16: exiting preview releases every listener.
		session.dispose();
		source.dispatchEvent(new MouseEvent("click"));
		expect(assign).toHaveBeenCalledOnce();
	});

	it("binds hover enter and leave to distinct events", () => {
		bindInteractions(
			[
				interaction({
					trigger: { type: "hover", phase: "leave" },
					actions: [{ type: "url", url: "https://a.example" }],
				}),
			],
			depsFor(),
		);
		source.dispatchEvent(new MouseEvent("mouseenter"));
		expect(assign).not.toHaveBeenCalled();
		source.dispatchEvent(new MouseEvent("mouseleave"));
		expect(assign).toHaveBeenCalledOnce();
	});

	it("fires a pageLoad trigger on its timer and cancels it on disposal", async () => {
		vi.useFakeTimers();
		try {
			bindInteractions(
				[
					interaction({
						trigger: { type: "pageLoad", delayMs: 50 },
						actions: [{ type: "url", url: "https://a.example" }],
					}),
				],
				depsFor(),
			);
			session.dispose();
			vi.advanceTimersByTime(200);
			// The timer was cleared, so leaving preview cannot navigate the
			// author away moments later.
			expect(assign).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("skips a trigger whose source element is not mounted", () => {
		bindInteractions(
			[
				interaction({
					sourceNodeId: "gone",
					actions: [{ type: "url", url: "https://a.example" }],
				}),
			],
			depsFor(),
		);
		expect(session.liveResourceCount).toBe(0);
	});
});

describe("bindInteractions — actions", () => {
	it("refuses a javascript: URL at fire time", () => {
		// The command validator already refuses these, but a document can
		// arrive from a collab peer that never passed through it.
		const onDiagnostic = vi.fn();
		bindInteractions(
			[
				interaction({
					actions: [{ type: "url", url: "javascript:alert(1)" }],
				}),
			],
			{ ...depsFor(), onDiagnostic },
		);
		source.dispatchEvent(new MouseEvent("click"));
		expect(assign).not.toHaveBeenCalled();
		expect(open).not.toHaveBeenCalled();
		expect(onDiagnostic).toHaveBeenCalledOnce();
	});

	it("opens a new tab with noopener", () => {
		bindInteractions(
			[
				interaction({
					actions: [{ type: "url", url: "https://a.example", newTab: true }],
				}),
			],
			depsFor(),
		);
		source.dispatchEvent(new MouseEvent("click"));
		// Without `noopener` the opened page can reach back through
		// `window.opener` into the editor.
		expect(open).toHaveBeenCalledWith(
			"https://a.example",
			"_blank",
			"noopener,noreferrer",
		);
	});

	it("hides a target and restores it on disposal", () => {
		bindInteractions(
			[
				interaction({
					actions: [
						{ type: "visibility", targetNodeId: "n2", operation: "hide" },
					],
				}),
			],
			depsFor(),
		);
		source.dispatchEvent(new MouseEvent("click"));
		expect(target.style.display).toBe("none");

		session.dispose();
		// Preview must not leave the author's canvas altered.
		expect(target.style.display).toBe("");
	});

	it("holds a variant override only for the session's lifetime", () => {
		bindInteractions(
			[
				interaction({
					actions: [
						{ type: "variant", targetNodeId: "n2", selection: { size: "lg" } },
					],
				}),
			],
			depsFor(),
		);
		source.dispatchEvent(new MouseEvent("click"));
		expect(session.variantOverrides.get("n2")).toEqual({ size: "lg" });

		session.dispose();
		expect(session.variantOverrides.size).toBe(0);
	});

	it("does not run actions when a condition is unsatisfied", () => {
		bindInteractions(
			[
				interaction({
					conditions: [{ type: "literal", value: false }],
					actions: [{ type: "url", url: "https://a.example" }],
				}),
			],
			depsFor(),
		);
		source.dispatchEvent(new MouseEvent("click"));
		expect(assign).not.toHaveBeenCalled();
	});

	it("runs actions when the condition holds", () => {
		bindInteractions(
			[
				interaction({
					conditions: [{ type: "literal", value: true }],
					actions: [{ type: "url", url: "https://a.example" }],
				}),
			],
			depsFor(),
		);
		source.dispatchEvent(new MouseEvent("click"));
		expect(assign).toHaveBeenCalledOnce();
	});
});

describe("bindInteractions — animation", () => {
	it("drives motion and registers the animation for disposal", async () => {
		const { animate } = await import("motion");
		bindInteractions(
			[
				interaction({
					actions: [
						{
							type: "animate",
							targetNodeIds: ["n2"],
							composition: "sequence",
							steps: [
								{
									to: { opacity: 0 },
									transition: {
										type: "tween",
										durationMs: 200,
										easing: [0.4, 0, 0.2, 1],
									},
								},
							],
						},
					],
				}),
			],
			depsFor(),
		);
		source.dispatchEvent(new MouseEvent("click"));

		expect(animate).toHaveBeenCalledOnce();
		// A running animation is a session resource — leaving preview must
		// stop it rather than let it finish against a torn-down canvas.
		expect(session.liveResourceCount).toBeGreaterThan(1);
	});

	it("drops a transform-only animation under reduced motion", async () => {
		const { animate } = await import("motion");
		vi.mocked(animate).mockClear();
		bindInteractions(
			[
				interaction({
					actions: [
						{
							type: "animate",
							targetNodeIds: ["n2"],
							composition: "sequence",
							steps: [
								{
									to: { translateX: 40 },
									transition: {
										type: "tween",
										durationMs: 200,
										easing: [0.4, 0, 0.2, 1],
									},
								},
							],
						},
					],
				}),
			],
			{ ...depsFor(), reducedMotion: true },
		);
		source.dispatchEvent(new MouseEvent("click"));
		// ED-MOTION-003 drops transforms rather than snapping them, so
		// there is nothing left to animate.
		expect(animate).not.toHaveBeenCalled();
	});
});
