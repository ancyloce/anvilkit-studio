/**
 * @file Tests for `<CanvasZoomControls>` — the floating bottom-center
 * Fit / − / % / + cluster extracted from the removed full-width
 * `StudioToolbar` (task Phase 3). Zoom is always `%`, distinct from the
 * viewport-width control's `px`.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CanvasZoomControls } from "@/layout/CanvasZoomControls";
import { EditorI18nProvider, EditorUiStoreProvider } from "@/state/index";

afterEach(cleanup);

function Setup({ children }: { readonly children: ReactNode }): ReactElement {
	return (
		<EditorI18nProvider>
			<EditorUiStoreProvider
				storeId={`zoom-controls-${Math.random().toString(36).slice(2)}`}
			>
				{children}
			</EditorUiStoreProvider>
		</EditorI18nProvider>
	);
}

describe("CanvasZoomControls", () => {
	it("starts at 100% and shows a %, not a px, value", () => {
		render(
			<Setup>
				<CanvasZoomControls naturalWidth={0} workspaceWidth={0} />
			</Setup>,
		);
		const value = screen.getByTestId("ak-canvas-zoom-value");
		expect(value.textContent).toBe("100%");
	});

	it("zooms in and out in 10% steps, clamped to [50%, 200%]", () => {
		render(
			<Setup>
				<CanvasZoomControls naturalWidth={0} workspaceWidth={0} />
			</Setup>,
		);
		const zoomIn = screen.getByRole("button", { name: "Zoom in" });
		const zoomOut = screen.getByRole("button", { name: "Zoom out" });
		const value = screen.getByTestId("ak-canvas-zoom-value");

		fireEvent.click(zoomIn);
		expect(value.textContent).toBe("110%");
		fireEvent.click(zoomOut);
		fireEvent.click(zoomOut);
		expect(value.textContent).toBe("90%");
	});

	it("disables Fit until both natural and workspace width are measured", () => {
		const { rerender } = render(
			<Setup>
				<CanvasZoomControls naturalWidth={0} workspaceWidth={0} />
			</Setup>,
		);
		expect(screen.getByRole("button", { name: "Fit" })).toBeDisabled();

		rerender(
			<Setup>
				<CanvasZoomControls naturalWidth={1280} workspaceWidth={1000} />
			</Setup>,
		);
		expect(screen.getByRole("button", { name: "Fit" })).not.toBeDisabled();
	});

	it("Fit sets zoom to (workspaceWidth - padding) / naturalWidth, clamped", () => {
		render(
			<Setup>
				<CanvasZoomControls naturalWidth={1280} workspaceWidth={1328} />
			</Setup>,
		);
		// (1328 - 48) / 1280 = 1.0 exactly.
		fireEvent.click(screen.getByRole("button", { name: "Fit" }));
		expect(screen.getByTestId("ak-canvas-zoom-value").textContent).toBe("100%");
	});

	it("Fit clamps to the 200% ceiling for a much smaller natural width", () => {
		render(
			<Setup>
				<CanvasZoomControls naturalWidth={100} workspaceWidth={2000} />
			</Setup>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Fit" }));
		expect(screen.getByTestId("ak-canvas-zoom-value").textContent).toBe("200%");
	});
});
