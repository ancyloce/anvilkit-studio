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
}: {
	readonly zoom: number;
	readonly viewportId: string;
}): ReactElement {
	const [, setZoom] = useCanvasZoom();
	const [, setViewport] = useCanvasViewport();
	useEffect(() => {
		setZoom(zoom);
		setViewport(viewportId);
	}, [zoom, viewportId, setZoom, setViewport]);
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
				<ZoomHarness zoom={zoom} viewportId="desktop" />
			</Setup>,
		);

		const frameEl = container.querySelector("[data-ak-canvas-frame]");
		const workspaceEl = frameEl?.parentElement?.parentElement;
		expect(frameEl).not.toBeNull();
		expect(workspaceEl).not.toBeNull();

		fireResize(frameEl as Element, DESKTOP_NATURAL_WIDTH, FRAME_NATURAL_HEIGHT);
		fireResize(workspaceEl as Element, WORKSPACE_WIDTH, WORKSPACE_HEIGHT);

		const stage = container.querySelector(
			"[data-ak-zoom-stage]",
		) as HTMLElement;
		expect(stage).not.toBeNull();
		expect(stage.style.width).toBe(`${DESKTOP_NATURAL_WIDTH * zoom}px`);
		expect(stage.style.height).toBe(`${FRAME_NATURAL_HEIGHT * zoom}px`);
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
