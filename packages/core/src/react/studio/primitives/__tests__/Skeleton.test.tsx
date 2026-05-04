/**
 * @file Smoke test for the `<Skeleton>` primitive.
 *
 * Verifies shape variants apply the right border-radius class and the
 * busy aria attributes are present so screen readers announce the
 * loading state.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Skeleton } from "../Skeleton.js";

afterEach(cleanup);

describe("Skeleton", () => {
	it("defaults to rect shape and announces busy state", () => {
		render(<Skeleton data-testid="skel" />);
		const el = screen.getByTestId("skel");
		expect(el.className).toContain("rounded-md");
		expect(el.getAttribute("aria-busy")).toBe("true");
		expect(el.getAttribute("role")).toBe("status");
	});

	it("supports circle and text variants", () => {
		render(
			<>
				<Skeleton shape="circle" data-testid="circle" />
				<Skeleton shape="text" data-testid="text" />
			</>,
		);
		expect(screen.getByTestId("circle").className).toContain("rounded-full");
		expect(screen.getByTestId("text").className).toContain("rounded-sm");
	});
});
