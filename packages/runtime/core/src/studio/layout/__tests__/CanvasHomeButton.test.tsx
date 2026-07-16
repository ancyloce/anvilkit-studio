/**
 * @file Tests for `<CanvasHomeButton>` — relocated from the removed
 * full-width `StudioToolbar` (task Phase 3). Behavior is unchanged:
 * navigates to the first page, reports list failures without an
 * unhandled rejection.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioPagesSourceProvider } from "@/context/pages-source";
import { CanvasHomeButton } from "@/layout/CanvasHomeButton";
import { EditorI18nProvider } from "@/state/index";
import type { StudioPagesSource } from "@/types/pages";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("sonner", () => ({
	toast: { error: toastError },
}));

afterEach(() => {
	cleanup();
	toastError.mockReset();
});

function Setup({
	children,
	pages,
}: {
	readonly children: ReactNode;
	readonly pages?: StudioPagesSource;
}): ReactElement {
	return (
		<EditorI18nProvider>
			<StudioPagesSourceProvider value={pages}>
				{children}
			</StudioPagesSourceProvider>
		</EditorI18nProvider>
	);
}

describe("CanvasHomeButton", () => {
	it("disables itself when no pages source is wired", () => {
		render(
			<Setup>
				<CanvasHomeButton />
			</Setup>,
		);
		expect(screen.getByRole("button", { name: "Home" })).toBeDisabled();
	});

	it("navigates to the first page on click", async () => {
		const onSelect = vi.fn();
		const pages: StudioPagesSource = {
			list: vi.fn().mockResolvedValue([{ id: "page-1", title: "Home" }]),
			onSelect,
		};
		render(
			<Setup pages={pages}>
				<CanvasHomeButton />
			</Setup>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Home" }));
		await vi.waitFor(() => expect(onSelect).toHaveBeenCalledWith("page-1"));
	});

	it("reports home navigation list failures without an unhandled rejection", async () => {
		const pages: StudioPagesSource = {
			list: vi.fn().mockRejectedValue(new Error("offline")),
		};
		render(
			<Setup pages={pages}>
				<CanvasHomeButton />
			</Setup>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Home" }));

		await vi.waitFor(() => {
			expect(toastError).toHaveBeenCalledWith("Could not load pages.");
		});
	});
});
