/**
 * @file `CanvasIframe` content-height reporting + scroll reset.
 *
 * Content-height reporting: an `<iframe>` never auto-grows to match
 * its own document's content (it's a replaced element), so the canvas
 * frame's real height has to be measured from INSIDE the iframe and
 * reported back out. Puck's own `#frame-root` mount sentinel is
 * styled `height: 1px; min-height: 100vh`, which pins ITS OWN box
 * (and every ancestor's, up through `<body>`/`<html>`) regardless of
 * real content — so this reads `scrollHeight` explicitly (jsdom has
 * no layout engine, hence the stub below) rather than trusting a
 * `ResizeObserver` entry's own `contentRect`, and treats both
 * `ResizeObserver` and `MutationObserver` purely as "something
 * changed, re-measure" triggers. The reported value feeds
 * `canvasRootHeight` in the editor UI store, which
 * `StudioViewportPreview` applies as the frame's explicit `height` —
 * required for Puck's own `.PuckPreview`/iframe `{ height: 100% }`
 * chain to resolve (see that file's doc for why a `min-height`-only
 * ancestor never lets that chain resolve, and collapses the iframe to
 * the browser's 150px UA default instead).
 *
 * Scroll reset: since the frame's own box tracks real content height,
 * the iframe should never need to scroll internally — all panning
 * happens on the outer workspace. `overflow: hidden !important` on
 * `<html>`/`<body>` guarantees that (unlike `overflow: visible`,
 * which the CSS spec substitutes with `auto` for a document's ROOT
 * element, and so would still show a native scrollbar).
 */

import { act, cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasIframe } from "@/overrides/canvas/CanvasIframe";
import { EditorUiStoreProvider, useEditorUiStore } from "@/state/index";

// `CanvasDropMount` needs a live `<Puck>` context (`useGetPuck`) purely
// for drag/drop wiring, which is unrelated to what this file covers —
// stub it out rather than standing up a full Puck app in these tests.
vi.mock("@/canvas-drop", () => ({
	CanvasDropMount: () => null,
}));

let resizeCb: ResizeObserverCallback | null = null;
let resizeObservedEl: Element | null = null;
let mutationCb: MutationCallback | null = null;
let mutationObservedEl: Node | null = null;

class MockResizeObserver {
	constructor(cb: ResizeObserverCallback) {
		resizeCb = cb;
	}
	observe(el: Element): void {
		resizeObservedEl = el;
	}
	unobserve(): void {
		/* no-op */
	}
	disconnect(): void {
		/* no-op */
	}
}

class MockMutationObserver {
	constructor(cb: MutationCallback) {
		mutationCb = cb;
	}
	observe(el: Node): void {
		mutationObservedEl = el;
	}
	disconnect(): void {
		/* no-op */
	}
	takeRecords(): MutationRecord[] {
		return [];
	}
}

let frameCbs: FrameRequestCallback[] = [];

/** Runs every animation frame the component has queued (observer re-measures are rAF-coalesced). */
function flushFrames(): void {
	const cbs = frameCbs;
	frameCbs = [];
	act(() => {
		for (const cb of cbs) cb(0);
	});
}

/** `report()` in the component ignores the entry payload and re-measures from the DOM — an empty entry is enough to trigger it. */
function fireResize(): void {
	act(() => resizeCb?.([], {} as ResizeObserver));
	flushFrames();
}

function fireMutation(): void {
	act(() => mutationCb?.([], {} as MutationObserver));
	flushFrames();
}

/** jsdom has no layout engine, so `scrollHeight` is a stubbed read-only getter — this replaces it on the instance. */
function stubScrollHeight(el: Element, height: number): void {
	Object.defineProperty(el, "scrollHeight", {
		configurable: true,
		value: height,
	});
}

/** jsdom lays nothing out, so every `getBoundingClientRect()` is 0×0 — this fakes one element's geometry. */
function stubRect(el: Element, bottom: number): void {
	Object.defineProperty(el, "getBoundingClientRect", {
		configurable: true,
		value: (): DOMRect =>
			({
				top: 0,
				bottom,
				left: 0,
				right: 0,
				width: 0,
				height: bottom,
			}) as DOMRect,
	});
}

/** A document from `createHTMLDocument` has no `defaultView`; tests that need one (e.g. `innerHeight`) install it here. */
function stubDefaultView(doc: Document, view: Partial<Window>): void {
	Object.defineProperty(doc, "defaultView", {
		configurable: true,
		value: view,
	});
}

beforeEach(() => {
	resizeCb = null;
	resizeObservedEl = null;
	mutationCb = null;
	mutationObservedEl = null;
	frameCbs = [];
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
	vi.stubGlobal("MutationObserver", MockMutationObserver);
	vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
		frameCbs.push(cb);
		return frameCbs.length;
	});
	vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
		frameCbs[id - 1] = () => {
			/* cancelled */
		};
	});
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function makeIframeDoc(): {
	readonly doc: Document;
	readonly frameRoot: HTMLElement;
} {
	const doc = document.implementation.createHTMLDocument("");
	const frameRoot = doc.createElement("div");
	frameRoot.id = "frame-root";
	doc.body.appendChild(frameRoot);
	return { doc, frameRoot };
}

function HeightReadout(): ReactElement {
	const height = useEditorUiStore((s) => s.canvasRootHeight);
	return <div data-testid="height">{height}</div>;
}

function Setup({ doc }: { readonly doc?: Document }): ReactElement {
	return (
		<EditorUiStoreProvider
			storeId={`canvas-iframe-${Math.random().toString(36).slice(2)}`}
		>
			<CanvasIframe document={doc}>
				<span>content</span>
			</CanvasIframe>
			<HeightReadout />
		</EditorUiStoreProvider>
	);
}

describe("CanvasIframe content-height reporting", () => {
	it("reports #frame-root's scrollHeight to the store on mount", () => {
		const { doc, frameRoot } = makeIframeDoc();
		stubScrollHeight(frameRoot, 7497);
		const { getByTestId } = render(<Setup doc={doc} />);
		expect(getByTestId("height").textContent).toBe("7497");
	});

	it("re-reads scrollHeight (not a stale observer entry) when the ResizeObserver fires", () => {
		const { doc, frameRoot } = makeIframeDoc();
		stubScrollHeight(frameRoot, 300);
		const { getByTestId } = render(<Setup doc={doc} />);
		expect(getByTestId("height").textContent).toBe("300");

		stubScrollHeight(frameRoot, 900);
		fireResize();
		expect(getByTestId("height").textContent).toBe("900");
	});

	it("re-reads scrollHeight when the MutationObserver fires (e.g. a component add/remove)", () => {
		const { doc, frameRoot } = makeIframeDoc();
		stubScrollHeight(frameRoot, 300);
		const { getByTestId } = render(<Setup doc={doc} />);
		expect(getByTestId("height").textContent).toBe("300");

		stubScrollHeight(frameRoot, 5000);
		fireMutation();
		expect(getByTestId("height").textContent).toBe("5000");
	});

	it("observes #frame-root for mutations and the iframe body for resize", () => {
		const { doc, frameRoot } = makeIframeDoc();
		render(<Setup doc={doc} />);
		expect(mutationObservedEl).toBe(frameRoot);
		expect(resizeObservedEl).toBe(doc.body);
	});

	it("does not observe anything before a document is available", () => {
		render(<Setup />);
		expect(resizeObservedEl).toBeNull();
		expect(mutationObservedEl).toBeNull();
	});

	// Regression: `scrollHeight` never returns less than the element's own
	// padding box, and Puck pins `#frame-root` at `min-height: 100vh` — so
	// once the host applies a reported height, `scrollHeight` reports THAT
	// height back rather than the content's. Feeding it in again resized the
	// iframe, re-fired these observers, and walked the value down by the
	// canvas frame's border on every pass until React aborted the render
	// with "Maximum update depth exceeded".
	it("measures the real content extent, not the viewport-floored scrollHeight", () => {
		const { doc, frameRoot } = makeIframeDoc();
		stubScrollHeight(frameRoot, 4998); // the previous report, echoed back
		const content = doc.createElement("div");
		stubRect(content, 300); // the page itself is only 300px tall
		frameRoot.appendChild(content);

		const { getByTestId } = render(<Setup doc={doc} />);
		expect(getByTestId("height").textContent).toBe("300");

		// The echo changes on every pass (the iframe keeps resizing); the
		// content does not, so the reported height must not move either.
		stubScrollHeight(frameRoot, 4996);
		fireResize();
		expect(getByTestId("height").textContent).toBe("300");
	});

	it("swallows a measurement that moved by exactly as much as the iframe viewport", () => {
		const { doc, frameRoot } = makeIframeDoc();
		// Mutable on purpose — the test moves it to simulate the iframe
		// resizing under an applied height (`Window.innerHeight` is readonly).
		const view = { innerHeight: 800 };
		stubDefaultView(doc, view);
		// A `min-h-screen` page: its own height IS the viewport height, so
		// growing the frame grows the content — circularity no measurement
		// strategy can remove. The reported height must still hold still.
		const content = doc.createElement("div");
		stubRect(content, 800);
		frameRoot.appendChild(content);

		const { getByTestId } = render(<Setup doc={doc} />);
		expect(getByTestId("height").textContent).toBe("800");

		// Host applies 800 → the iframe viewport lands 2px short (canvas
		// frame border) → the content shrinks by exactly the same 2px.
		view.innerHeight = 798;
		stubRect(content, 798);
		fireResize();
		expect(getByTestId("height").textContent).toBe("800");
	});

	it("coalesces a burst of observer notifications into one animation frame", () => {
		const { doc, frameRoot } = makeIframeDoc();
		stubScrollHeight(frameRoot, 300);
		const { getByTestId } = render(<Setup doc={doc} />);
		expect(getByTestId("height").textContent).toBe("300");

		act(() => {
			resizeCb?.([], {} as ResizeObserver);
			mutationCb?.([], {} as MutationObserver);
			resizeCb?.([], {} as ResizeObserver);
		});
		expect(frameCbs.length).toBe(1);

		stubScrollHeight(frameRoot, 900);
		flushFrames();
		expect(getByTestId("height").textContent).toBe("900");
	});

	it("disconnects both observers on unmount", () => {
		const { doc } = makeIframeDoc();
		const resizeDisconnect = vi.fn();
		const mutationDisconnect = vi.fn();
		class SpyResizeObserver extends MockResizeObserver {
			override disconnect(): void {
				resizeDisconnect();
			}
		}
		class SpyMutationObserver extends MockMutationObserver {
			override disconnect(): void {
				mutationDisconnect();
			}
		}
		vi.stubGlobal("ResizeObserver", SpyResizeObserver);
		vi.stubGlobal("MutationObserver", SpyMutationObserver);
		const { unmount } = render(<Setup doc={doc} />);
		unmount();
		expect(resizeDisconnect).toHaveBeenCalledTimes(1);
		// Two `MutationObserver`s exist in this component (the pre-existing
		// style-reset watcher, plus this file's content-height watcher) —
		// both must disconnect on unmount.
		expect(mutationDisconnect).toHaveBeenCalledTimes(2);
	});
});

// Regression: the canvas frame's own box is kept in sync with real
// content height (see "content-height reporting" above), so the
// iframe should never need its own scrollbar — `overflow: visible`
// doesn't guarantee that (a document ROOT element can't truly opt out
// of the browser's scroll mechanism; the spec substitutes `auto`),
// only `hidden` does.
describe("CanvasIframe scroll reset", () => {
	it("forces overflow: hidden !important on <html> and <body>", () => {
		const { doc } = makeIframeDoc();
		render(<Setup doc={doc} />);
		for (const el of [doc.documentElement, doc.body]) {
			expect(el.style.getPropertyValue("overflow")).toBe("hidden");
			expect(el.style.getPropertyPriority("overflow")).toBe("important");
		}
	});

	it("overrides a pre-existing overflow value (e.g. one CopyHostStyles mirrored in from the host page)", () => {
		const { doc } = makeIframeDoc();
		// A mismatched single-axis rule is exactly the shape Next's
		// `html, body { overflow-x: hidden }` scaffold mirrors in — the
		// component must win over it, not just skip because SOME
		// overflow declaration already exists.
		doc.documentElement.style.setProperty("overflow-x", "hidden");
		render(<Setup doc={doc} />);
		expect(doc.documentElement.style.getPropertyValue("overflow")).toBe(
			"hidden",
		);
		expect(doc.documentElement.style.getPropertyPriority("overflow")).toBe(
			"important",
		);
	});

	it("clears max-width so host page rules can't constrain canvas content width", () => {
		const { doc } = makeIframeDoc();
		render(<Setup doc={doc} />);
		for (const el of [doc.documentElement, doc.body]) {
			expect(el.style.getPropertyValue("max-width")).toBe("none");
			expect(el.style.getPropertyPriority("max-width")).toBe("important");
		}
	});
});
