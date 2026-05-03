/**
 * @file Read-only invariant: a `readOnly` field must never invoke
 * `onChange` even when its DOM input dispatches a change event
 * (PRD §9.5).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { NumberField } from "../NumberField.js";
import { RadioField } from "../RadioField.js";
import { SelectField } from "../SelectField.js";
import { TextareaField } from "../TextareaField.js";
import { TextField } from "../TextField.js";

describe("read-only invariant", () => {
	it("TextField does not call onChange when readOnly", () => {
		const onChange = vi.fn();
		render(
			<TextField
				field={{ type: "text" }}
				value="x"
				onChange={onChange}
				readOnly
				name="t"
			/>,
		);
		const input = screen.getByDisplayValue("x");
		fireEvent.change(input, { target: { value: "y" } });
		expect(onChange).not.toHaveBeenCalled();
	});

	it("TextareaField does not call onChange when readOnly", () => {
		const onChange = vi.fn();
		render(
			<TextareaField
				field={{ type: "textarea" }}
				value="x"
				onChange={onChange}
				readOnly
				name="t"
			/>,
		);
		const input = screen.getByDisplayValue("x");
		fireEvent.change(input, { target: { value: "y" } });
		expect(onChange).not.toHaveBeenCalled();
	});

	it("NumberField does not call onChange when readOnly", () => {
		const onChange = vi.fn();
		render(
			<NumberField
				field={{ type: "number" }}
				value={1}
				onChange={onChange}
				readOnly
				name="n"
			/>,
		);
		const input = screen.getByDisplayValue("1");
		fireEvent.change(input, { target: { value: "2" } });
		expect(onChange).not.toHaveBeenCalled();
	});

	it("SelectField does not call onChange when readOnly", () => {
		const onChange = vi.fn();
		render(
			<SelectField
				field={{
					type: "select",
					options: [
						{ label: "A", value: "a" },
						{ label: "B", value: "b" },
					],
				}}
				value="a"
				onChange={onChange}
				readOnly
				name="s"
			/>,
		);
		const select = screen.getByDisplayValue("A");
		fireEvent.change(select, { target: { value: "b" } });
		// Browser usually blocks change on disabled<select>; the assert is
		// the contract — even if a programmatic change fires, no onChange.
		expect(onChange).not.toHaveBeenCalled();
	});

	it("RadioField does not call onChange when readOnly", () => {
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
				readOnly
				name="r"
			/>,
		);
		const optionB = screen.getByLabelText("B");
		fireEvent.click(optionB);
		expect(onChange).not.toHaveBeenCalled();
	});
});
