/**
 * @file Tests for ExternalField async list handling.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalField } from "@/overrides/fields/field-types/ExternalField";

afterEach(cleanup);

describe("ExternalField", () => {
	it("renders an error state when fetchList rejects", async () => {
		render(
			<ExternalField
				field={{
					type: "external",
					fetchList: vi.fn().mockRejectedValue(new Error("offline")),
				}}
				value={null}
				onChange={vi.fn()}
				name="entry"
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /select/i }));

		expect(await screen.findByText("Could not load results")).toBeTruthy();
	});
});
