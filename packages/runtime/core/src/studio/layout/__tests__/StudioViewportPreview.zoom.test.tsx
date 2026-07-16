/**
 * @file Zoom stage geometry (task Phase 4).
 *
 * `transform: scale()` alone does not change an element's layout box,
 * so these tests pin the fix directly: the Zoom Stage
 * (`[data-ak-zoom-stage]`) must be explicitly sized to
 * `naturalSize * zoom`, computed from the canvas frame's pre-transform
 * content box (never from a post-transform `getBoundingClientRect()`
 * read, which would double-apply the zoom factor).
 */

import { act, cleanup, render } from "@testing-library/react";
import { type ReactElement, type ReactNode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioViewportPreview } from "@/layout/StudioViewportPreview";
import { EditorI18nProvider, EditorUiStoreProvider } from "@/state/index";
import {
	useCanvasRootHeight,
	useCanvasViewport,
	useCanvasZoom,
} from "@/state/slices/editor-ui-selectors";

vi.mock("@puckeditor/core", () => ({
	Puck: {
		Preview: () => <div data-testid="puck-preview" />,
	},
}));

interface ResizeEntryInit {
	readonly el: Element;
	readonly cb: ResizeObserverCallback;
}

let observed: ResizeEntryInit[] = [];

class MockResizeObserver {
	#cb: ResizeObserverCallback;
	constructor(cb: ResizeObserverCallback) {
		this.#cb = cb;
	}
	observe(el: Element): void {
		observed.push({ el, cb: this.#cb });
	}
	unobserve(): void {
		/* no-op */
	}
	disconnect(): void {
		observed = observed.filter((entry) => entry.cb !== this.#cb);
	}
}

function fireResize(el: Element, width: number, height: number): void {
	const entry = {
		target: el,
		contentRect: {
			width,
			height,
			top: 0,
			left: 0,
			right: width,
			bottom: height,
			x: 0,
			y: 0,
		},
		contentBoxSize: [{ inlineSize: width, blockSize: height }],
		borderBoxSize: [{ inlineSize: width, blockSize: height }],
		devicePixelContentBoxSize: [{ inlineSize: width, blockSize: height }],
	} as unknown as ResizeObserverEntry;
	for (const { el: target, cb } of observed) {
		if (target === el) {
			act(() => cb([entry], {} as ResizeObserver));
		}
	}
}

beforeEach(() => {
	observed = [];
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function Setup({ children }: { readonly children: ReactNode }): ReactElement {
	return (
		<EditorI18nProvider>
			<EditorUiStoreProvider
				storeId={`zoom-${Math.random().toString(36).slice(2)}`}
			>
				{children}
			</EditorUiStoreProvider>
		</EditorI18nProvider>
	);
}

function ZoomHarness({
	zoom,
	viewportId,
	contentHeight,
}: {
	readonly zoom: number;
	readonly viewportId: string;
	// The real page content height, as reported from inside the iframe
	// (`CanvasIframe`'s `#frame-root` observer) via `canvasRootHeight` —
	// `<Puck.Preview>` is mocked out below, so tests drive this directly
	// through the store instead of a real iframe round-trip.
	readonly contentHeight?: number;
}): ReactElement {
	const [, setZoom] = useCanvasZoom();
	const [, setViewport] = useCanvasViewport();
	const [, setCanvasRootHeight] = useCanvasRootHeight();
	useEffect(() => {
		setZoom(zoom);
		setViewport(viewportId);
		if (contentHeight !== undefined) {
			setCanvasRootHeight(contentHeight);
		}
	}, [
		zoom,
		viewportId,
		contentHeight,
		setZoom,
		setViewport,
		setCanvasRootHeight,
	]);
	return <StudioViewportPreview />;
}

const DESKTOP_NATURAL_WIDTH = 1280;
const FRAME_NATURAL_HEIGHT = 900;
const WORKSPACE_WIDTH = 2000;
const WORKSPACE_HEIGHT = 800;

describe("StudioViewportPreview zoom stage geometry", () => {
	it.each([
		0.5, 0.75, 1, 1.25, 2,
	])("sizes the zoom stage to naturalSize * %s zoom", (zoom) => {
		const { container } = render(
			<Setup>
				<ZoomHarness
					zoom={zoom}
					viewportId="desktop"
					contentHeight={FRAME_NATURAL_HEIGHT}
				/>
			</Setup>,
		);

		const frameEl = container.querySelector("[data-ak-canvas-frame]");
		const workspaceEl = frameEl?.parentElement?.parentElement;
		expect(frameEl).not.toBeNull();
		expect(workspaceEl).not.toBeNull();

		// Width comes from a real `ResizeObserver` on the workspace;
		// height comes from the store (`contentHeight` above) — the
		// canvas frame's own box is never observed (see the file doc:
		// an iframe never auto-grows to its content, so that would be
		// circular).
		fireResize(workspaceEl as Element, WORKSPACE_WIDTH, WORKSPACE_HEIGHT);

		const stage = container.querySelector(
			"[data-ak-zoom-stage]",
		) as HTMLElement;
		expect(stage).not.toBeNull();
		expect(stage.style.width).toBe(`${DESKTOP_NATURAL_WIDTH * zoom}px`);
		expect(stage.style.height).toBe(`${FRAME_NATURAL_HEIGHT * zoom}px`);
	});

	// Regression: the canvas frame must carry an explicit `height` (not
	// just `min-height`) equal to the real content height reported from
	// inside the iframe. Puck's own `.PuckPreview`/iframe
	// `{ height: 100% }` chain can only resolve against an ancestor
	// with a DEFINITE `height` — a `min-height` alone never establishes
	// a percentage basis — so without this the iframe silently
	// collapses to the browser's 150px UA default and real page content
	// (however tall) renders hidden behind an iframe-internal
	// scrollbar. This is what "the canvas area is not fully expanded"
	// looked like in practice.
	it("sets the frame's explicit height to the real (store-reported) content height, not just min-height", () => {
		const { container } = render(
			<Setup>
				<ZoomHarness
					zoom={1}
					viewportId="desktop"
					contentHeight={FRAME_NATURAL_HEIGHT}
				/>
			</Setup>,
		);
		const frameEl = container.querySelector(
			"[data-ak-canvas-frame]",
		) as HTMLElement;
		expect(frameEl.style.height).toBe(`${FRAME_NATURAL_HEIGHT}px`);
	});

	it("preserves the configured viewport's natural (unscaled) width regardless of zoom", () => {
		const { container } = render(
			<Setup>
				<ZoomHarness zoom={0.5} viewportId="desktop" />
			</Setup>,
		);
		const frameEl = container.querySelector(
			"[data-ak-canvas-frame]",
		) as HTMLElement;
		// The frame element itself keeps the natural width — only the
		// `transform: scale()` shrinks it visually. The 3rd-party layout
		// box that scroll bounds are computed from is the Zoom Stage, not
		// this element.
		expect(frameEl.style.width).toBe(`${DESKTOP_NATURAL_WIDTH}px`);
		expect(frameEl.style.transform).toBe("scale(0.5)");
	});

	it("uses a top-left transform origin so the scaled frame exactly fills the zoom stage", () => {
		const { container } = render(
			<Setup>
				<ZoomHarness zoom={1.25} viewportId="desktop" />
			</Setup>,
		);
		const frameEl = container.querySelector(
			"[data-ak-canvas-frame]",
		) as HTMLElement;
		expect(frameEl.style.transformOrigin).toBe("top left");
	});

	it("keeps the frame's background filling at least the workspace height at every zoom (min-height compensates for scale)", () => {
		const zoom = 0.5;
		const { container } = render(
			<Setup>
				<ZoomHarness zoom={zoom} viewportId="desktop" />
			</Setup>,
		);
		const frameEl = container.querySelector("[data-ak-canvas-frame]");
		const workspaceEl = frameEl?.parentElement?.parentElement as Element;
		fireResize(workspaceEl, WORKSPACE_WIDTH, WORKSPACE_HEIGHT);

		const frame = container.querySelector(
			"[data-ak-canvas-frame]",
		) as HTMLElement;
		// Unscaled min-height must equal workspaceHeight / zoom so that,
		// once scaled, the visual min-height matches the workspace exactly.
		expect(frame.style.minHeight).toBe(`${WORKSPACE_HEIGHT / zoom}px`);
	});
});
