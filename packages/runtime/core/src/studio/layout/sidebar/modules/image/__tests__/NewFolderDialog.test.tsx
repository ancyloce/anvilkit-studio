/**
 * @file Tests for `<NewFolderDialog>` (report 0003, P2-11).
 *
 * `useMsg` resolves from `DEFAULT_MESSAGES` without a provider, so the dialog
 * renders its real labels in isolation.
 */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NewFolderDialog } from "../NewFolderDialog";

afterEach(cleanup);

describe("<NewFolderDialog>", () => {
	it("does not render the form when closed", () => {
		render(
			<NewFolderDialog
				open={false}
				onOpenChange={vi.fn()}
				onSubmit={vi.fn()}
			/>,
		);
		expect(screen.queryByTestId("ak-image-new-folder-input")).toBeNull();
	});

	it("disables submit until a non-empty name is entered", () => {
		render(<NewFolderDialog open onOpenChange={vi.fn()} onSubmit={vi.fn()} />);
		expect(screen.getByTestId("ak-image-new-folder-submit")).toBeDisabled();
		fireEvent.change(screen.getByTestId("ak-image-new-folder-input"), {
			target: { value: "Brand" },
		});
		expect(screen.getByTestId("ak-image-new-folder-submit")).not.toBeDisabled();
	});

	it("submits a trimmed name and closes the dialog", async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		const onOpenChange = vi.fn();
		render(
			<NewFolderDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />,
		);
		fireEvent.change(screen.getByTestId("ak-image-new-folder-input"), {
			target: { value: "  Brand  " },
		});
		fireEvent.click(screen.getByTestId("ak-image-new-folder-submit"));
		await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("Brand"));
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	});

	it("surfaces an inline error when onSubmit rejects (dialog stays open)", async () => {
		const onSubmit = vi.fn().mockRejectedValue(new Error("Folder exists"));
		const onOpenChange = vi.fn();
		render(
			<NewFolderDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />,
		);
		fireEvent.change(screen.getByTestId("ak-image-new-folder-input"), {
			target: { value: "Brand" },
		});
		fireEvent.click(screen.getByTestId("ak-image-new-folder-submit"));
		await waitFor(() =>
			expect(screen.getByText("Folder exists")).toBeInTheDocument(),
		);
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});
});
