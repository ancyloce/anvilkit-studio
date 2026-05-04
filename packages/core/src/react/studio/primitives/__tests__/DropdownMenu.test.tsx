/**
 * @file Smoke test for the `<DropdownMenu>` primitive.
 *
 * Asserts the popup mounts, items render, and the destructive tone
 * variant applies the right token class.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DropdownMenu } from "../DropdownMenu.js";

afterEach(cleanup);

describe("DropdownMenu", () => {
	it("renders items inside the popup", () => {
		render(
			<DropdownMenu.Root open>
				<DropdownMenu.Trigger>Menu</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Positioner>
						<DropdownMenu.Popup data-testid="popup">
							<DropdownMenu.Item>Rename</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item tone="destructive" data-testid="danger">
								Delete
							</DropdownMenu.Item>
						</DropdownMenu.Popup>
					</DropdownMenu.Positioner>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>,
		);
		expect(screen.getByTestId("popup")).toBeTruthy();
		expect(screen.getByText("Rename")).toBeTruthy();
		const danger = screen.getByTestId("danger");
		expect(danger.className).toContain("text-red-600");
	});
});
