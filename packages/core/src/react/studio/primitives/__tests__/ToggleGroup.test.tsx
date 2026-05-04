/**
 * @file Smoke test for the `<ToggleGroup>` primitive.
 *
 * Verifies items render, value-controlled selection paints the
 * pressed state, and items carry the focus-ring class.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ToggleGroup } from "../ToggleGroup.js";

afterEach(cleanup);

describe("ToggleGroup", () => {
	it("renders items with pressed state for the active value", () => {
		render(
			<ToggleGroup.Root<"grid" | "list"> value={["grid"]}>
				<ToggleGroup.Item<"grid" | "list"> value="grid" data-testid="grid">
					Grid
				</ToggleGroup.Item>
				<ToggleGroup.Item<"grid" | "list"> value="list" data-testid="list">
					List
				</ToggleGroup.Item>
			</ToggleGroup.Root>,
		);
		const grid = screen.getByTestId("grid");
		const list = screen.getByTestId("list");
		expect(grid.getAttribute("aria-pressed")).toBe("true");
		expect(list.getAttribute("aria-pressed")).toBe("false");
		expect(grid.className).toContain(
			"focus-visible:ring-[var(--ak-studio-ring)]",
		);
	});
});
