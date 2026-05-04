import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/primitives/button";

afterEach(cleanup);

describe("Button", () => {
	it("renders icon sizing and forwards click events", () => {
		const handler = vi.fn();

		render(
			<Button size="icon-lg" onClick={handler} data-testid="btn">
				+
			</Button>,
		);

		const btn = screen.getByTestId("btn");
		expect(btn.className).toContain("size-9");
		fireEvent.click(btn);
		expect(handler).toHaveBeenCalledTimes(1);
	});
});
