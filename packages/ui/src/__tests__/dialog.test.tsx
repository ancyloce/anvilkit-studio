import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../dialog";

afterEach(() => {
	cleanup();
});

function ControlledDialog() {
	const [open, setOpen] = useState(false);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger>Open</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Title here</DialogTitle>
					<DialogDescription>Body content for the dialog.</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<button type="button" onClick={() => setOpen(false)}>
						Cancel
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

describe("Dialog", () => {
	it("opens via trigger and reveals title + description", async () => {
		render(<ControlledDialog />);
		expect(screen.queryByText("Title here")).toBeNull();

		fireEvent.click(screen.getByText("Open"));

		await waitFor(() => {
			expect(screen.getByText("Title here")).toBeDefined();
		});
		expect(screen.getByText("Body content for the dialog.")).toBeDefined();
	});

	it("closes when the user presses Escape", async () => {
		render(<ControlledDialog />);
		fireEvent.click(screen.getByText("Open"));
		await waitFor(() => {
			expect(screen.getByText("Title here")).toBeDefined();
		});

		fireEvent.keyDown(document.activeElement ?? document.body, {
			key: "Escape",
			code: "Escape",
		});

		await waitFor(() => {
			expect(screen.queryByText("Title here")).toBeNull();
		});
	});

	it("re-exports each Base UI subcomponent via @anvilkit/ui exports", async () => {
		const exports = await import("../dialog");
		const required = [
			"Dialog",
			"DialogTrigger",
			"DialogPortal",
			"DialogBackdrop",
			"DialogContent",
			"DialogHeader",
			"DialogFooter",
			"DialogTitle",
			"DialogDescription",
			"DialogClose",
		];
		for (const name of required) {
			expect(typeof (exports as Record<string, unknown>)[name]).toBe(
				"function",
			);
		}
	});
});
