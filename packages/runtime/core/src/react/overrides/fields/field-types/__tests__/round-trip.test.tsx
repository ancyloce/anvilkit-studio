/**
 * @file Round-trip tests: render → user edit → onChange payload
 * matches expected type. Covers TextField, TextareaField,
 * NumberField, SelectField, RadioField (PRD §9.5).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { NumberField } from "@/overrides/fields/field-types/NumberField";
import { RadioField } from "@/overrides/fields/field-types/RadioField";
import { SelectField } from "@/overrides/fields/field-types/SelectField";
import { TextareaField } from "@/overrides/fields/field-types/TextareaField";
import { TextField } from "@/overrides/fields/field-types/TextField";

describe("TextField round-trip", () => {
	it("emits the new string on change", () => {
		const onChange = vi.fn();
		render(
			<TextField
				field={{ type: "text" }}
				value="initial"
				onChange={onChange}
				name="title"
			/>,
		);
		const input = screen.getByDisplayValue("initial");
		fireEvent.change(input, { target: { value: "updated" } });
		expect(onChange).toHaveBeenCalledWith("updated");
		expect(typeof onChange.mock.calls[0]?.[0]).toBe("string");
	});
});

describe("TextareaField round-trip", () => {
	it("emits the new string on change", () => {
		const onChange = vi.fn();
		render(
			<TextareaField
				field={{ type: "textarea" }}
				value="hello"
				onChange={onChange}
				name="body"
			/>,
		);
		const textarea = screen.getByDisplayValue("hello");
		fireEvent.change(textarea, { target: { value: "world" } });
		expect(onChange).toHaveBeenCalledWith("world");
	});
});

describe("NumberField round-trip", () => {
	it("emits a number when the input is numeric", () => {
		const onChange = vi.fn();
		render(
			<NumberField
				field={{ type: "number" }}
				value={1}
				onChange={onChange}
				name="count"
			/>,
		);
		const input = screen.getByDisplayValue("1");
		fireEvent.change(input, { target: { value: "42" } });
		expect(onChange).toHaveBeenCalledWith(42);
		expect(typeof onChange.mock.calls[0]?.[0]).toBe("number");
	});

	it("emits undefined when the input is cleared", () => {
		const onChange = vi.fn();
		render(
			<NumberField
				field={{ type: "number" }}
				value={5}
				onChange={onChange}
				name="count"
			/>,
		);
		const input = screen.getByDisplayValue("5");
		fireEvent.change(input, { target: { value: "" } });
		expect(onChange).toHaveBeenCalledWith(undefined);
	});

	it("always uses tabular numerals", () => {
		render(
			<NumberField
				field={{ type: "number" }}
				value={5}
				onChange={vi.fn()}
				name="count"
			/>,
		);
		expect(screen.getByDisplayValue("5").className).toContain("tabular-nums");
	});

	it("renders no unit suffix when field.metadata.unit is absent (unchanged plain <Input>)", () => {
		render(
			<NumberField
				field={{ type: "number" }}
				value={5}
				onChange={vi.fn()}
				name="count"
			/>,
		);
		expect(screen.queryByText("px")).toBeNull();
	});

	it("shows the unit suffix from field.metadata.unit (task Phase 7)", () => {
		const onChange = vi.fn();
		render(
			<NumberField
				field={{ type: "number", metadata: { unit: "px" } }}
				value={16}
				onChange={onChange}
				name="gap"
			/>,
		);
		expect(screen.getByText("px")).not.toBeNull();
		const input = screen.getByDisplayValue("16");
		fireEvent.change(input, { target: { value: "24" } });
		expect(onChange).toHaveBeenCalledWith(24);
	});
});

describe("SelectField round-trip", () => {
	it("emits the selected option's value", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<SelectField
				field={{
					type: "select",
					options: [
						{ label: "One", value: "one" },
						{ label: "Two", value: "two" },
					],
				}}
				value="one"
				onChange={onChange}
				name="size"
			/>,
		);
		// Open the popup, then click "Two".
		await user.click(screen.getByRole("combobox"));
		await user.click(await screen.findByRole("option", { name: "Two" }));
		expect(onChange).toHaveBeenCalledWith("two");
	});
});

describe("RadioField round-trip", () => {
	it("emits the selected radio's value", () => {
		const onChange = vi.fn();
		render(
			<RadioField
				field={{
					type: "radio",
					options: [
						{ label: "A", value: "a" },
						{ label: "B", value: "b" },
					],
				}}
				value="a"
				onChange={onChange}
				name="choice"
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "B" }));
		expect(onChange).toHaveBeenCalledWith("b");
	});

	it("does not collide null with the string 'null'", () => {
		const onChange = vi.fn();
		render(
			<RadioField
				field={{
					type: "radio",
					options: [
						{ label: "Null value", value: null },
						{ label: "String null", value: "null" },
					],
				}}
				value={null}
				onChange={onChange}
				name="choice"
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "String null" }));
		expect(onChange).toHaveBeenCalledWith("null");
	});

	it("does not collide undefined with the empty string", () => {
		const onChange = vi.fn();
		render(
			<RadioField
				field={{
					type: "radio",
					options: [
						{ label: "Undefined value", value: undefined },
						{ label: "Empty string", value: "" },
					],
				}}
				value={undefined}
				onChange={onChange}
				name="choice"
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Empty string" }));
		expect(onChange).toHaveBeenCalledWith("");
	});
});

describe("RadioField boolean-shaped → Switch (task Phase 7)", () => {
	const booleanOptions = [
		{ label: "On", value: true },
		{ label: "Off", value: false },
	];

	it("renders a Switch, not a segmented ToggleGroup, for a true/false radio field", () => {
		render(
			<RadioField
				field={{ type: "radio", options: booleanOptions }}
				value={false}
				onChange={vi.fn()}
				name="enabled"
			/>,
		);
		expect(screen.getByRole("switch")).not.toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("reflects the current boolean value as checked state", () => {
		render(
			<RadioField
				field={{ type: "radio", options: booleanOptions }}
				value={true}
				onChange={vi.fn()}
				name="enabled"
			/>,
		);
		expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
	});

	it("emits the toggled boolean value on click", () => {
		const onChange = vi.fn();
		render(
			<RadioField
				field={{ type: "radio", options: booleanOptions }}
				value={false}
				onChange={onChange}
				name="enabled"
			/>,
		);
		fireEvent.click(screen.getByRole("switch"));
		expect(onChange).toHaveBeenCalledWith(true);
		expect(typeof onChange.mock.calls[0]?.[0]).toBe("boolean");
	});

	it("keeps the segmented ToggleGroup for a non-boolean 2-option field (e.g. alignment)", () => {
		render(
			<RadioField
				field={{
					type: "radio",
					options: [
						{ label: "Left", value: "left" },
						{ label: "Right", value: "right" },
					],
				}}
				value="left"
				onChange={vi.fn()}
				name="align"
			/>,
		);
		expect(screen.queryByRole("switch")).toBeNull();
		expect(screen.getByRole("button", { name: "Left" })).not.toBeNull();
	});
});
