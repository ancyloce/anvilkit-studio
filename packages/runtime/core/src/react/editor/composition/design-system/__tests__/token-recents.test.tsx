import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
	TokenRecentsProvider,
	useRememberToken,
	useTokenRecents,
} from "../token-recents.js";

afterEach(cleanup);

function Probe({ name }: { readonly name: string }): ReactNode {
	const recents = useTokenRecents();
	const remember = useRememberToken();
	return (
		<section>
			<output data-testid={`${name}-recents`}>{recents.join(",")}</output>
			<button type="button" onClick={() => remember(`${name}-token`)}>
				remember-{name}
			</button>
		</section>
	);
}

describe("token recents per Studio mount", () => {
	it("shares recents within one provider and isolates sibling providers", () => {
		render(
			<>
				<TokenRecentsProvider>
					<Probe name="left" />
					<Probe name="left-peer" />
				</TokenRecentsProvider>
				<TokenRecentsProvider>
					<Probe name="right" />
				</TokenRecentsProvider>
			</>,
		);

		fireEvent.click(screen.getByRole("button", { name: "remember-left" }));

		expect(screen.getByTestId("left-recents").textContent).toBe("left-token");
		expect(screen.getByTestId("left-peer-recents").textContent).toBe(
			"left-token",
		);
		expect(screen.getByTestId("right-recents").textContent).toBe("");
	});
});
