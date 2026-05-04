import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Skeleton } from "../skeleton.js";

afterEach(cleanup);

describe("Skeleton", () => {
	it("renders the shadcn skeleton surface", () => {
		render(<Skeleton data-testid="skel" />);

		const el = screen.getByTestId("skel");
		expect(el.className).toContain("animate-pulse");
		expect(el.className).toContain("bg-muted");
	});
});
