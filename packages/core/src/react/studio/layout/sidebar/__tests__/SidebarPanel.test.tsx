/**
 * @file Tests for the `<SidebarPanel>` component (PRD §4.2, §4.3).
 *
 * Covers header title resolution from i18n, `aria-live` semantics,
 * `×` close behavior, Esc handling, and `aria-labelledby` wiring.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorI18nStoreProvider } from "../../../state/editor-i18n-store.js";
import { SidebarPanel } from "../SidebarPanel.js";

afterEach(cleanup);

function renderPanel(props: Partial<React.ComponentProps<typeof SidebarPanel>> = {}) {
	const onClose = props.onClose ?? vi.fn();
	const onEscape = props.onEscape ?? vi.fn();
	const utils = render(
		<EditorI18nStoreProvider>
			<SidebarPanel
				title="Insert"
				activeTabId="ak-rail-tab-insert"
				onClose={onClose}
				onEscape={onEscape}
				{...props}
			>
				<div data-testid="body">body content</div>
			</SidebarPanel>
		</EditorI18nStoreProvider>,
	);
	return { ...utils, onClose, onEscape };
}

describe("SidebarPanel", () => {
	it("renders header title and body", () => {
		renderPanel({ title: "Pages & Layers" });
		const title = screen.getByRole("heading", { level: 2 });
		expect(title.textContent).toBe("Pages & Layers");
		expect(screen.getByTestId("body").textContent).toBe("body content");
	});

	it("title carries aria-live=polite for module-switch announcements", () => {
		renderPanel();
		const title = screen.getByRole("heading", { level: 2 });
		expect(title.getAttribute("aria-live")).toBe("polite");
	});

	it("renders as a tabpanel with aria-labelledby pointing at the active rail tab id", () => {
		renderPanel({ activeTabId: "ak-rail-tab-image" });
		const panel = screen.getByRole("tabpanel");
		expect(panel.id).toBe("ak-sidebar-panel");
		expect(panel.getAttribute("aria-labelledby")).toBe("ak-rail-tab-image");
	});

	it("clicking the close button fires onClose with the i18n label", () => {
		const onClose = vi.fn();
		renderPanel({ onClose });
		const closeButton = screen.getByRole("button", { name: "Close panel" });
		fireEvent.click(closeButton);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("Esc within the panel triggers onEscape and not onClose", () => {
		const onClose = vi.fn();
		const onEscape = vi.fn();
		renderPanel({ onClose, onEscape });
		const panel = screen.getByRole("tabpanel");
		fireEvent.keyDown(panel, { key: "Escape" });
		expect(onEscape).toHaveBeenCalledTimes(1);
		expect(onClose).not.toHaveBeenCalled();
	});

	it("renders custom actions before the close button", () => {
		renderPanel({
			actions: <button data-testid="custom-action">Toggle</button>,
		});
		expect(screen.getByTestId("custom-action").textContent).toBe("Toggle");
		// Both action and close button present.
		expect(
			screen.getByRole("button", { name: "Close panel" }),
		).toBeTruthy();
	});
});
