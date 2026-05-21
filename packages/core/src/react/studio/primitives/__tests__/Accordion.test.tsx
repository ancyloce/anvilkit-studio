import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
	Accordion,
	AccordionItem,
	AccordionPanel,
	AccordionTrigger,
} from "@/primitives/accordion";

afterEach(cleanup);

describe("Accordion", () => {
	it("renders items and exposes content when expanded", () => {
		render(
			<Accordion defaultValue={["one"]}>
				<AccordionItem value="one">
					<AccordionTrigger data-testid="trigger">Section one</AccordionTrigger>
					<AccordionPanel>
						<p data-testid="panel">Body one</p>
					</AccordionPanel>
				</AccordionItem>
			</Accordion>,
		);

		expect(screen.getByText("Section one")).toBeTruthy();
		expect(screen.getByTestId("panel").textContent).toBe("Body one");
		expect(screen.getByTestId("trigger").className).toContain(
			"focus-visible:ring",
		);
	});
});
