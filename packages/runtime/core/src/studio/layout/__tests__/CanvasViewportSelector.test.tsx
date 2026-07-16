/**
 * @file Tests for `<CanvasViewportSelector>` — the floating top-left
 * device-preset + viewport-width control extracted from the removed
 * full-width `StudioToolbar` (task Phase 3). Viewport width is always
 * `px`/formatted-width, never confusable with zoom's `%`.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CanvasViewportSelector } from "@/layout/CanvasViewportSelector";
import { EditorI18nProvider, EditorUiStoreProvider } from "@/state/index";

afterEach(cleanup);

function Setup({ children }: { readonly children: ReactNode }): ReactElement {
	return (
		<EditorI18nProvider>
			<EditorUiStoreProvider
				storeId={`viewport-selector-${Math.random().toString(36).slice(2)}`}
			>
				{children}
			</EditorUiStoreProvider>
		</EditorI18nProvider>
	);
}

describe("CanvasViewportSelector", () => {
	it("shows the active viewport's label and px width, distinct from any % value", () => {
		render(
			<Setup>
				<CanvasViewportSelector />
			</Setup>,
		);
		const trigger = screen.getByRole("button", { name: /Desktop/ });
		expect(trigger.textContent).toContain("1280px");
		expect(trigger.textContent).not.toMatch(/%/);
	});

	it("switches the active viewport on selection", () => {
		render(
			<Setup>
				<CanvasViewportSelector />
			</Setup>,
		);
		fireEvent.click(screen.getByRole("button", { name: /Desktop/ }));
		fireEvent.click(screen.getByRole("menuitem", { name: /Mobile/ }));
		expect(
			screen.getByRole("button", { name: /Mobile/ }).textContent,
		).toContain("360px");
	});
});
