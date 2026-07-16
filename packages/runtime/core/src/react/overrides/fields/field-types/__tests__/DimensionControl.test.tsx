/**
 * @file Tests for `DimensionControl` — value fidelity is the contract:
 * unit switches preserve the number, semantic keywords round-trip as
 * bare strings, and values the control cannot represent fall back to
 * a plain text input instead of being coerced or destroyed.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	DimensionControl,
	parseDimension,
} from "@/overrides/fields/field-types/DimensionControl";
import { EditorI18nProvider } from "@/state/index";

afterEach(cleanup);

const UNITS = ["px", "%", "rem", "auto", "fill"] as const;

describe("parseDimension", () => {
	it("splits number + unit", () => {
		expect(parseDimension("100px", UNITS)).toEqual({
			kind: "number",
			amount: "100",
			unit: "px",
		});
		expect(parseDimension("-1.5rem", UNITS)).toEqual({
			kind: "number",
			amount: "-1.5",
			unit: "rem",
		});
	});

	it("recognizes semantic keywords from the unit list", () => {
		expect(parseDimension("auto", UNITS)).toEqual({
			kind: "keyword",
			keyword: "auto",
		});
		expect(parseDimension("fill", UNITS)).toEqual({
			kind: "keyword",
			keyword: "fill",
		});
	});

	it("treats empty and whitespace as empty", () => {
		expect(parseDimension(undefined, UNITS).kind).toBe("empty");
		expect(parseDimension("  ", UNITS).kind).toBe("empty");
	});

	it("marks unrepresentable expressions opaque", () => {
		expect(parseDimension("calc(100% - 2rem)", UNITS).kind).toBe("opaque");
		expect(parseDimension("min-content", UNITS).kind).toBe("opaque");
	});
});

function renderControl(
	value: string | undefined,
	onCommit: (next: string) => void,
): ReturnType<typeof render> {
	return render(
		<EditorI18nProvider>
			<DimensionControl
				id="dim"
				name="width"
				label="Width"
				value={value}
				units={[...UNITS]}
				onCommit={onCommit}
			/>
		</EditorI18nProvider>,
	);
}

describe("DimensionControl", () => {
	it("commits number + active unit on typing", () => {
		const onCommit = vi.fn();
		renderControl("100px", onCommit);
		const input = screen.getByLabelText("Width");
		fireEvent.change(input, { target: { value: "240" } });
		expect(onCommit).toHaveBeenLastCalledWith("240px");
	});

	it("preserves the numeric value when switching dimensional units", async () => {
		const user = userEvent.setup();
		const onCommit = vi.fn();
		renderControl("100px", onCommit);
		await user.click(screen.getByLabelText("Unit"));
		await user.click(await screen.findByRole("option", { name: "%" }));
		expect(onCommit).toHaveBeenLastCalledWith("100%");
	});

	it("stores a bare semantic keyword and disables the numeric input", async () => {
		const user = userEvent.setup();
		const onCommit = vi.fn();
		const { rerender } = renderControl("100px", onCommit);
		await user.click(screen.getByLabelText("Unit"));
		await user.click(await screen.findByRole("option", { name: "auto" }));
		expect(onCommit).toHaveBeenLastCalledWith("auto");

		rerender(
			<EditorI18nProvider>
				<DimensionControl
					id="dim"
					name="width"
					label="Width"
					value="auto"
					units={[...UNITS]}
					onCommit={onCommit}
				/>
			</EditorI18nProvider>,
		);
		expect(screen.getByLabelText("Width")).toBeDisabled();
	});

	it("restores the remembered number when switching back from a keyword", async () => {
		const user = userEvent.setup();
		const onCommit = vi.fn();
		const { rerender } = renderControl("120px", onCommit);
		// Switch to keyword, then back to a dimensional unit.
		await user.click(screen.getByLabelText("Unit"));
		await user.click(await screen.findByRole("option", { name: "auto" }));
		rerender(
			<EditorI18nProvider>
				<DimensionControl
					id="dim"
					name="width"
					label="Width"
					value="auto"
					units={[...UNITS]}
					onCommit={onCommit}
				/>
			</EditorI18nProvider>,
		);
		await user.click(screen.getByLabelText("Unit"));
		await user.click(await screen.findByRole("option", { name: "%" }));
		expect(onCommit).toHaveBeenLastCalledWith("120%");
	});

	it("does not commit unparseable intermediate input", () => {
		const onCommit = vi.fn();
		renderControl("100px", onCommit);
		const input = screen.getByLabelText("Width");
		fireEvent.change(input, { target: { value: "12abc" } });
		expect(onCommit).not.toHaveBeenCalledWith("12abcpx");
	});

	it("falls back to a plain text input for opaque values and never destroys them", () => {
		const onCommit = vi.fn();
		renderControl("calc(100% - 2rem)", onCommit);
		const input = screen.getByTestId("ak-dimension-opaque");
		expect(input).toHaveValue("calc(100% - 2rem)");
		fireEvent.change(input, { target: { value: "calc(100% - 3rem)" } });
		expect(onCommit).toHaveBeenLastCalledWith("calc(100% - 3rem)");
	});
});
