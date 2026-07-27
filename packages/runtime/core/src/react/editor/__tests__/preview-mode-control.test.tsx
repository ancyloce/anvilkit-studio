/**
 * `PreviewModeControl` — the §16 design/preview switch
 * (PLAN-0020 CORE-P3-002; ED-MOTION-002/003).
 *
 * The rule under test is "preview mode ... always provides a **visible**
 * return-to-design control". An author in preview has no editing
 * handles, so a hard-to-find exit is the failure mode worth pinning.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorStoreProvider } from "@/state/EditorStoreProvider";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import { PreviewModeControl } from "../interactions/PreviewModeControl.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";

/** The control is editor-gated, so a bridge must be present. */
function renderControl(bridge: unknown = {}): void {
	render(
		<EditorI18nProvider>
			<EditorStoreProvider storeId="preview-mode-test">
				<StudioEditorBridgeContext value={bridge as never}>
					<PreviewModeControl />
				</StudioEditorBridgeContext>
			</EditorStoreProvider>
		</EditorI18nProvider>,
	);
}

beforeEach(() => {
	// jsdom has no matchMedia; the reduced-motion hook must tolerate that
	// rather than crashing the chrome.
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		configurable: true,
		value: vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})),
	});
});

afterEach(() => {
	cleanup();
});

describe("PreviewModeControl", () => {
	it("is hidden when the editor runtime is absent", () => {
		// A Studio with the editor feature off has no interactions to
		// preview, so offering the mode would be a control that does
		// nothing.
		renderControl(null);
		expect(screen.queryByTestId("ak-preview-enter")).toBeNull();
		expect(screen.queryByTestId("ak-preview-active")).toBeNull();
	});

	it("starts in design mode", () => {
		renderControl();
		expect(screen.getByTestId("ak-preview-enter")).toBeTruthy();
		expect(screen.queryByTestId("ak-preview-active")).toBeNull();
	});

	it("enters preview and shows a visible return-to-design control (§16)", () => {
		renderControl();
		fireEvent.click(screen.getByTestId("ak-preview-enter"));

		expect(screen.getByTestId("ak-preview-active")).toBeTruthy();
		const exit = screen.getByTestId("ak-preview-exit");
		// Not a bare icon: it carries a label, because the author's
		// handles are gone and the way back must be obvious.
		expect(exit.textContent?.trim().length ?? 0).toBeGreaterThan(0);
	});

	it("announces the mode change", () => {
		renderControl();
		fireEvent.click(screen.getByTestId("ak-preview-enter"));
		expect(screen.getByTestId("ak-preview-active").getAttribute("role")).toBe(
			"status",
		);
	});

	it("returns to design mode", () => {
		renderControl();
		fireEvent.click(screen.getByTestId("ak-preview-enter"));
		fireEvent.click(screen.getByTestId("ak-preview-exit"));
		expect(screen.getByTestId("ak-preview-enter")).toBeTruthy();
		expect(screen.queryByTestId("ak-preview-active")).toBeNull();
	});

	it("surfaces reduced motion rather than silently applying it", () => {
		// An author must not conclude their animation is broken when it
		// is being honoured (ED-MOTION-003).
		(
			window.matchMedia as unknown as ReturnType<typeof vi.fn>
		).mockImplementation((query: string) => ({
			matches: true,
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		}));
		renderControl();
		fireEvent.click(screen.getByTestId("ak-preview-enter"));
		expect(screen.getByTestId("ak-preview-reduced-motion")).toBeTruthy();
	});

	it("does not show the reduced-motion note when the user has not asked for it", () => {
		renderControl();
		fireEvent.click(screen.getByTestId("ak-preview-enter"));
		expect(screen.queryByTestId("ak-preview-reduced-motion")).toBeNull();
	});
});

/** Keeps the JSX pragma satisfied under the react-library preset. */
export type _Unused = ReactNode;
