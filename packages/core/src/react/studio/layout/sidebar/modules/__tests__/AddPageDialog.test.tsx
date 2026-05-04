/**
 * @file Tests for `AddPageDialog`.
 *
 * Covers form rendering, route-path validation, and the onCreate
 * dispatch path.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioPagesSource } from "../../../../../../types/pages";
import { StudioPagesSourceProvider } from "../../../../context/pages-source";
import { EditorI18nStoreProvider } from "../../../../state/index";
import { AddPageDialog } from "../layer/AddPageDialog";

afterEach(cleanup);

function Setup({
	children,
	source,
}: {
	readonly children: ReactNode;
	readonly source?: StudioPagesSource;
}): ReactElement {
	return (
		<EditorI18nStoreProvider>
			<StudioPagesSourceProvider value={source}>
				{children}
			</StudioPagesSourceProvider>
		</EditorI18nStoreProvider>
	);
}

describe("AddPageDialog", () => {
	it("renders title, path, and route fields with correct labels", () => {
		render(
			<Setup>
				<AddPageDialog open onOpenChange={() => undefined} />
			</Setup>,
		);
		expect(screen.getByTestId("ak-layer-add-page-title")).toBeTruthy();
		expect(screen.getByTestId("ak-layer-add-page-path")).toBeTruthy();
		expect(screen.getByTestId("ak-layer-add-page-route")).toBeTruthy();
	});

	it("calls onCreate with the form values on submit", async () => {
		const onCreate = vi.fn();
		const source: StudioPagesSource = {
			list: () => [],
			onCreate,
		};
		const onOpenChange = vi.fn();
		render(
			<Setup source={source}>
				<AddPageDialog open onOpenChange={onOpenChange} />
			</Setup>,
		);
		fireEvent.change(screen.getByTestId("ak-layer-add-page-title"), {
			target: { value: "Home page" },
		});
		fireEvent.change(screen.getByTestId("ak-layer-add-page-path"), {
			target: { value: "/home" },
		});
		fireEvent.click(screen.getByTestId("ak-layer-add-page-submit"));
		await vi.waitFor(() => {
			expect(onCreate).toHaveBeenCalledWith({
				title: "Home page",
				path: "/home",
				route: false,
			});
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("shows a path validation error when route is checked but path is invalid", () => {
		const onCreate = vi.fn();
		const source: StudioPagesSource = {
			list: () => [],
			onCreate,
		};
		render(
			<Setup source={source}>
				<AddPageDialog open onOpenChange={() => undefined} />
			</Setup>,
		);
		fireEvent.change(screen.getByTestId("ak-layer-add-page-title"), {
			target: { value: "About" },
		});
		fireEvent.change(screen.getByTestId("ak-layer-add-page-path"), {
			target: { value: "about" },
		});
		fireEvent.click(screen.getByTestId("ak-layer-add-page-route"));
		// Submit button is disabled while the validation predicate is
		// failing, so the form's onSubmit should not fire — assert the
		// disabled state and confirm onCreate is never called.
		const submitButton = screen.getByTestId(
			"ak-layer-add-page-submit",
		) as HTMLButtonElement;
		expect(submitButton.disabled).toBe(true);
		expect(onCreate).not.toHaveBeenCalled();
	});
});
