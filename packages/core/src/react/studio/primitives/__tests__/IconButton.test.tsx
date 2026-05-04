/**
 * @file Smoke test for the `<IconButton>` primitive.
 *
 * Asserts size variants resolve, the focus-ring class is present, and
 * `variant="rail"` ships the active-indicator pseudo-element class so
 * the rail tab visual treatment will paint when `aria-selected="true"`.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IconButton } from "../IconButton.js";

afterEach(cleanup);

describe("IconButton", () => {
	it("renders with rail size class and focus ring", () => {
		render(
			<IconButton size="rail" variant="rail" data-testid="btn">
				▦
			</IconButton>,
		);
		const btn = screen.getByTestId("btn");
		expect(btn.className).toContain("size-11");
		expect(btn.className).toContain("focus-visible:ring-[var(--ak-studio-ring)]");
		// rail variant ships the indicator pseudo-element class.
		expect(btn.className).toContain("before:bg-[var(--ak-studio-accent)]");
	});

	it("forwards click events", () => {
		const handler = vi.fn();
		render(
			<IconButton onClick={handler} data-testid="btn">
				+
			</IconButton>,
		);
		fireEvent.click(screen.getByTestId("btn"));
		expect(handler).toHaveBeenCalledTimes(1);
	});
});
