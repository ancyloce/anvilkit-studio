/**
 * @file Smoke test for the `<Popover>` primitive.
 *
 * Verifies the trigger renders, the popup mounts on open, and the
 * focus-ring token class is present on the popup body.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Popover } from "../Popover.js";

afterEach(cleanup);

describe("Popover", () => {
	it("renders trigger and shows popup on default-open", () => {
		render(
			<Popover.Root open>
				<Popover.Trigger>Open</Popover.Trigger>
				<Popover.Portal>
					<Popover.Positioner>
						<Popover.Popup data-testid="popup">Body</Popover.Popup>
					</Popover.Positioner>
				</Popover.Portal>
			</Popover.Root>,
		);
		expect(screen.getByText("Open")).toBeTruthy();
		const popup = screen.getByTestId("popup");
		expect(popup.textContent).toBe("Body");
		expect(popup.className).toContain("focus-visible:ring-[var(--ak-studio-ring)]");
	});

	it("applies size variants", () => {
		render(
			<Popover.Root open>
				<Popover.Trigger>Open</Popover.Trigger>
				<Popover.Portal>
					<Popover.Positioner>
						<Popover.Popup data-testid="popup" size="sm">
							Body
						</Popover.Popup>
					</Popover.Positioner>
				</Popover.Portal>
			</Popover.Root>,
		);
		expect(screen.getByTestId("popup").className).toContain("min-w-[140px]");
	});
});
