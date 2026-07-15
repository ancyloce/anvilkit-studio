import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../context-menu";

afterEach(() => {
	cleanup();
});

describe("ContextMenu", () => {
	it("renders items inside the content (controlled open)", () => {
		render(
			<ContextMenu open>
				<ContextMenuTrigger data-testid="surface">area</ContextMenuTrigger>
				<ContextMenuContent data-testid="popup">
					<ContextMenuItem>Copy</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem variant="destructive" data-testid="danger">
						Delete
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>,
		);
		expect(screen.getByTestId("popup")).toBeTruthy();
		expect(screen.getByText("Copy")).toBeTruthy();
		expect(screen.getByTestId("danger").className).toContain(
			"text-destructive",
		);
	});

	it("exports are wired (subcomponents are functions)", () => {
		for (const part of [
			ContextMenu,
			ContextMenuTrigger,
			ContextMenuContent,
			ContextMenuItem,
			ContextMenuSeparator,
		]) {
			expect(typeof part).toBe("function");
		}
	});
});
