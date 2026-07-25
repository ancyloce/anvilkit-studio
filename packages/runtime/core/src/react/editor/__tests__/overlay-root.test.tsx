/**
 * @file CORE-P1B-003 — `AuthoringOverlayRoot`: body-level sibling
 * container (never inside `#frame-root` — the height-loop rule),
 * multi-selection rings excluding the primary, live re-ring on
 * selection changes, and pause/remount on document replacement.
 */

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { type ReactNode, useMemo, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioEditorBridge } from "../bridge.js";
import { createCanvasDomRegistry } from "../canvas/dom-registry.js";
import {
	AuthoringOverlayRoot,
	OVERLAY_ROOT_ID,
	useOverlayPortalRegistration,
} from "../canvas/overlay-root.js";
import { createEditorSelectionController } from "../selection.js";

/** Registration log for the portal spy (module-mock scope). */
interface PortalRegistration {
	readonly element: HTMLElement;
	readonly options: unknown;
	unregistered: boolean;
}

vi.mock("@puckeditor/core", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@puckeditor/core")>();
	const registered: PortalRegistration[] = [];
	return {
		...actual,
		registered,
		registerOverlayPortal: (element: HTMLElement, options?: unknown) => {
			const entry: PortalRegistration = {
				element,
				options,
				unregistered: false,
			};
			registered.push(entry);
			return () => {
				entry.unregistered = true;
			};
		},
	};
});

afterEach(cleanup);

function iframeDoc(): Document {
	const doc = document.implementation.createHTMLDocument();
	doc.body.innerHTML = `
		<div id="frame-root">
			<div data-ak-node="n-1">one</div>
			<div data-ak-node="n-2">two</div>
			<div data-ak-node="n-3">three</div>
		</div>`;
	return doc;
}

function setup() {
	const bridge = createStudioEditorBridge();
	const registry = createCanvasDomRegistry();
	bridge.canvasRegistry = registry;
	bridge.selection = createEditorSelectionController({
		syncPrimaryToPuck: () => undefined,
		onChange: () => bridge.notify(),
	});
	const doc = iframeDoc();
	registry.register(doc);
	bridge.canvasDocument = doc;
	render(<AuthoringOverlayRoot bridge={bridge} />);
	return { bridge, doc };
}

describe("AuthoringOverlayRoot (CORE-P1B-003)", () => {
	it("mounts the container as a body-level sibling of #frame-root", async () => {
		const { doc } = setup();
		await waitFor(() => {
			const container = doc.getElementById(OVERLAY_ROOT_ID);
			expect(container).not.toBeNull();
			expect(container?.parentElement).toBe(doc.body);
			// Never inside #frame-root (height-loop rule).
			expect(container?.closest("#frame-root")).toBeNull();
			expect(container?.style.height).toBe("0px");
			expect(container?.style.pointerEvents).toBe("none");
		});
	});

	it("rings selected ids beyond the primary and tracks selection changes", async () => {
		const { bridge, doc } = setup();
		act(() => {
			bridge.selection?.selectMany(["n-1", "n-2", "n-3"], "n-1");
		});
		await waitFor(() => {
			const rings = doc.querySelectorAll("[data-ak-selection-ring]");
			expect(
				[...rings].map((ring) => ring.getAttribute("data-ak-selection-ring")),
			).toEqual(["n-2", "n-3"]);
		});
		act(() => {
			bridge.selection?.select("n-2");
		});
		await waitFor(() => {
			expect(doc.querySelectorAll("[data-ak-selection-ring]")).toHaveLength(0);
		});
	});

	it("pauses and remounts on document replacement", async () => {
		const { bridge, doc } = setup();
		act(() => {
			bridge.selection?.selectMany(["n-1", "n-2"], "n-1");
		});
		await waitFor(() =>
			expect(doc.getElementById(OVERLAY_ROOT_ID)).not.toBeNull(),
		);

		const nextDoc = iframeDoc();
		act(() => {
			bridge.canvasRegistry?.register(nextDoc);
			bridge.notifyCanvasDocument(nextDoc);
		});
		await waitFor(() => {
			// Old document cleaned, new document hosts the layer.
			expect(doc.getElementById(OVERLAY_ROOT_ID)).toBeNull();
			expect(nextDoc.getElementById(OVERLAY_ROOT_ID)).not.toBeNull();
			expect(nextDoc.querySelectorAll("[data-ak-selection-ring]")).toHaveLength(
				1,
			);
		});
	});

	it("renders nothing without a canvas document", () => {
		const bridge = createStudioEditorBridge();
		render(<AuthoringOverlayRoot bridge={bridge} />);
		expect(document.getElementById(OVERLAY_ROOT_ID)).toBeNull();
	});

	it("keeps every ring non-interactive (Puck DnD passes through)", async () => {
		const { bridge, doc } = setup();
		act(() => {
			bridge.selection?.selectMany(["n-1", "n-2"], "n-1");
		});
		await waitFor(() => {
			const rings = doc.querySelectorAll<HTMLElement>(
				"[data-ak-selection-ring]",
			);
			expect(rings.length).toBeGreaterThan(0);
			for (const ring of rings) {
				expect(ring.style.pointerEvents).toBe("none");
			}
		});
	});

	it("registers interactive overlay elements through Puck's overlay portal", async () => {
		const { registered } = (await import("@puckeditor/core")) as unknown as {
			registered: PortalRegistration[];
		};
		const before = registered.length;
		function Interactive(): ReactNode {
			const ref = useRef<HTMLDivElement | null>(null);
			useOverlayPortalRegistration(
				ref,
				useMemo(() => ({ disableDrag: true }), []),
			);
			return <div ref={ref} data-testid="interactive-overlay" />;
		}
		const { unmount } = render(<Interactive />);
		await waitFor(() => {
			expect(registered.length).toBe(before + 1);
			expect(registered[before]?.options).toEqual({ disableDrag: true });
			expect(registered[before]?.unregistered).toBe(false);
		});
		unmount();
		expect(registered[before]?.unregistered).toBe(true);
	});
});
