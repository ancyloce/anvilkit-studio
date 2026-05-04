/**
 * @file Smoke test for the `<Accordion>` primitive.
 *
 * Verifies items render, panel content is visible when expanded, and
 * the trigger carries the focus-ring token class.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Accordion } from "../Accordion.js";

afterEach(cleanup);

describe("Accordion", () => {
	it("renders items and exposes panel content when expanded", () => {
		render(
			<Accordion.Root defaultValue={["one"]}>
				<Accordion.Item value="one">
					<Accordion.Header>
						<Accordion.Trigger data-testid="trigger">Section one</Accordion.Trigger>
					</Accordion.Header>
					<Accordion.Panel>
						<p data-testid="panel">Body one</p>
					</Accordion.Panel>
				</Accordion.Item>
			</Accordion.Root>,
		);
		expect(screen.getByText("Section one")).toBeTruthy();
		expect(screen.getByTestId("panel").textContent).toBe("Body one");
		expect(screen.getByTestId("trigger").className).toContain(
			"focus-visible:ring-[var(--ak-studio-ring)]",
		);
	});
});
