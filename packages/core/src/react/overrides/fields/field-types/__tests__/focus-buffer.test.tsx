/**
 * @file Focus-aware local-value buffer: while a text/textarea/number
 * field is focused, external `value`-prop churn must not clobber the
 * displayed value (which is what otherwise resets the caret to the
 * end of a controlled input — the symptom reported under collab
 * mode). On blur, the buffer re-syncs to the latest external value.
 *
 * Tests use `fireEvent.focus`/`fireEvent.blur` rather than the native
 * `HTMLElement.focus()`/`.blur()` methods so React's synthetic event
 * system actually fires the handlers we attached; the native methods
 * only update the DOM `activeElement` in jsdom.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NumberField } from "@/overrides/fields/field-types/NumberField";
import { TextareaField } from "@/overrides/fields/field-types/TextareaField";
import { TextField } from "@/overrides/fields/field-types/TextField";

afterEach(cleanup);

describe("TextField focus buffer", () => {
	it("preserves the user-typed value while focused even when the external value prop changes", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<TextField
				field={{ type: "text" }}
				value="hello"
				onChange={onChange}
				name="title"
			/>,
		);
		const input = screen.getByDisplayValue("hello") as HTMLInputElement;
		fireEvent.focus(input);
		// Simulate the user typing "X" mid-string.
		fireEvent.change(input, { target: { value: "helXlo" } });
		expect(onChange).toHaveBeenLastCalledWith("helXlo");
		expect(input.value).toBe("helXlo");
		// Parent re-renders the field with a stale value — e.g. an
		// echoed remote IR coming back through the collab plugin
		// before the local keystroke has round-tripped through
		// Puck's reducer.
		rerender(
			<TextField
				field={{ type: "text" }}
				value="hello"
				onChange={onChange}
				name="title"
			/>,
		);
		// The buffer must ignore the stale prop — otherwise the
		// controlled input reconciles against "hello" and React
		// clamps the caret to the end on the next paint.
		expect(input.value).toBe("helXlo");
	});

	it("re-syncs to the external value when the field blurs", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<TextField
				field={{ type: "text" }}
				value="a"
				onChange={onChange}
				name="t"
			/>,
		);
		const input = screen.getByDisplayValue("a") as HTMLInputElement;
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "ab" } });
		// Remote write lands mid-typing.
		rerender(
			<TextField
				field={{ type: "text" }}
				value="remote"
				onChange={onChange}
				name="t"
			/>,
		);
		expect(input.value).toBe("ab");
		fireEvent.blur(input);
		// After blur, the buffer commits to whatever the latest
		// external value is — so the user sees the remote edit the
		// instant they release focus.
		expect(input.value).toBe("remote");
	});

	it("commits the parsed value to onChange on every keystroke (no debounce)", () => {
		const onChange = vi.fn();
		render(
			<TextField
				field={{ type: "text" }}
				value=""
				onChange={onChange}
				name="t"
			/>,
		);
		const input = screen.getByRole("textbox") as HTMLInputElement;
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "x" } });
		fireEvent.change(input, { target: { value: "xy" } });
		fireEvent.change(input, { target: { value: "xyz" } });
		expect(onChange.mock.calls.map((c) => c[0])).toEqual(["x", "xy", "xyz"]);
	});
});

describe("TextareaField focus buffer", () => {
	it("preserves the user-typed value (and the caret position) while focused", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<TextareaField
				field={{ type: "textarea" }}
				value="Write fast with"
				onChange={onChange}
				name="headline"
			/>,
		);
		const textarea = screen.getByDisplayValue(
			"Write fast with",
		) as HTMLTextAreaElement;
		fireEvent.focus(textarea);
		textarea.setSelectionRange(5, 5);
		// User types "X" at offset 5.
		fireEvent.change(textarea, { target: { value: "WriteX fast with" } });
		// Place the caret where the browser would after the insert.
		textarea.setSelectionRange(6, 6);
		expect(onChange).toHaveBeenLastCalledWith("WriteX fast with");
		// External re-render with a stale value identity (same string
		// as the pre-keystroke state, fresh object reference) — this
		// is exactly the shape the collab plugin's atomic `replace`
		// produces when the remote IR echoes back.
		rerender(
			<TextareaField
				field={{ type: "textarea" }}
				value="Write fast with"
				onChange={onChange}
				name="headline"
			/>,
		);
		expect(textarea.value).toBe("WriteX fast with");
		// And the caret stayed where the user left it.
		expect(textarea.selectionStart).toBe(6);
		expect(textarea.selectionEnd).toBe(6);
	});
});

describe("NumberField focus buffer", () => {
	it("preserves an in-progress numeric edit while focused, ignoring external value churn", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<NumberField
				field={{ type: "number" }}
				value={1}
				onChange={onChange}
				name="count"
			/>,
		);
		const input = screen.getByDisplayValue("1") as HTMLInputElement;
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "2" } });
		expect(onChange).toHaveBeenLastCalledWith(2);
		// External re-render — collab dispatch round-trips the
		// already-typed value back, but with a fresh prop identity.
		// The buffer must NOT reset the input to the externally
		// observed value while the user is still focused.
		rerender(
			<NumberField
				field={{ type: "number" }}
				value={99}
				onChange={onChange}
				name="count"
			/>,
		);
		expect(input.value).toBe("2");
	});

	it("re-syncs from the external numeric value on blur", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<NumberField
				field={{ type: "number" }}
				value={1}
				onChange={onChange}
				name="count"
			/>,
		);
		const input = screen.getByDisplayValue("1") as HTMLInputElement;
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "2" } });
		rerender(
			<NumberField
				field={{ type: "number" }}
				value={42}
				onChange={onChange}
				name="count"
			/>,
		);
		expect(input.value).toBe("2");
		fireEvent.blur(input);
		expect(input.value).toBe("42");
	});
});
