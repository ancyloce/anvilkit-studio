import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../dropdown-menu.js";

afterEach(cleanup);

describe("DropdownMenu", () => {
	it("renders items inside the content", () => {
		render(
			<DropdownMenu open>
				<DropdownMenuTrigger>Menu</DropdownMenuTrigger>
				<DropdownMenuContent data-testid="popup">
					<DropdownMenuItem>Rename</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" data-testid="danger">
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		expect(screen.getByTestId("popup")).toBeTruthy();
		expect(screen.getByText("Rename")).toBeTruthy();
		expect(screen.getByTestId("danger").className).toContain(
			"text-destructive",
		);
	});
});
