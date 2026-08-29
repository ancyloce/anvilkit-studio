import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Slider } from "../slider";

afterEach(cleanup);

it("forwards an accessible name to each focusable range input", () => {
	render(
		<Slider
			value={[40]}
			getAriaLabel={(index) => `Volume ${index + 1}`}
			onValueChange={() => undefined}
		/>,
	);

	expect(screen.getByLabelText("Volume 1")).toHaveAttribute("type", "range");
});
