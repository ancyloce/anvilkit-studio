import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Popover, PopoverContent, PopoverTrigger } from "../popover";

afterEach(cleanup);

describe("Popover", () => {
	it("renders trigger and shows content when open", () => {
		render(
			<Popover open>
				<PopoverTrigger>Open</PopoverTrigger>
				<PopoverContent data-testid="popup">Body</PopoverContent>
			</Popover>,
		);

		expect(screen.getByText("Open")).toBeTruthy();
		const popup = screen.getByTestId("popup");
		expect(popup.textContent).toBe("Body");
		expect(popup.className).toContain("bg-popover");
	});
});
