import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ToggleGroup, ToggleGroupItem } from "@/primitives/toggle-group";

afterEach(cleanup);

describe("ToggleGroup", () => {
	it("renders items with pressed state for the active value", () => {
		render(
			<ToggleGroup value={["grid"]}>
				<ToggleGroupItem value="grid" data-testid="grid">
					Grid
				</ToggleGroupItem>
				<ToggleGroupItem value="list" data-testid="list">
					List
				</ToggleGroupItem>
			</ToggleGroup>,
		);

		const grid = screen.getByTestId("grid");
		const list = screen.getByTestId("list");
		expect(grid.getAttribute("aria-pressed")).toBe("true");
		expect(list.getAttribute("aria-pressed")).toBe("false");
		expect(grid.className).toContain("focus-visible");
	});
});
