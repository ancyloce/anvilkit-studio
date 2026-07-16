/**
 * @file Tests for the shared field chrome (`use-field-chrome.tsx`)
 * through the real renderers: compact property-row opt-in, description
 * + `aria-describedby` association, and the reset-to-default
 * affordance backed by `config.defaultProps` (`use-field-default.ts`).
 *
 * Mocks `createUsePuck` with a snapshot carrying `selectedItem` +
 * `config` so `useFieldDefault` resolves against a component's
 * declared `defaultProps`, exactly as inside a real `<Puck>` mount.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockPuckState {
	selectedItem: { type: string; props: { id: string } } | null;
	config: Record<string, unknown>;
}

let puckState: MockPuckState;

vi.mock("@puckeditor/core", () => ({
	createUsePuck:
		() =>
		<T,>(selector: (s: MockPuckState) => T): T =>
			useSyncExternalStore(
				() => () => undefined,
				() => selector(puckState),
				() => selector(puckState),
			),
}));

import type { TextField as PuckTextField } from "@puckeditor/core";
import { RadioField } from "@/overrides/fields/field-types/RadioField";
import { TextField } from "@/overrides/fields/field-types/TextField";
import { EditorI18nProvider } from "@/state/index";

beforeEach(() => {
	puckState = {
		selectedItem: { type: "Hero", props: { id: "h-1" } },
		config: {
			components: {
				Hero: { defaultProps: { title: "Build faster", live: true } },
			},
		},
	};
});

afterEach(cleanup);

function renderText(
	field: Partial<PuckTextField> & { metadata?: Record<string, unknown> },
	value: string | undefined,
	onChange = vi.fn(),
): ReturnType<typeof vi.fn> {
	render(
		<EditorI18nProvider>
			<TextField
				field={{ type: "text", ...field } as PuckTextField}
				value={value}
				onChange={onChange}
				id="field-title"
				name="title"
			/>
		</EditorI18nProvider>,
	);
	return onChange;
}

describe("field chrome — description", () => {
	it("renders the metadata description and associates it via aria-describedby", () => {
		renderText(
			{
				label: "Title",
				metadata: { description: "Shown above the fold." },
			},
			"Hello",
		);
		const description = screen.getByText("Shown above the fold.");
		expect(description.id).toBe("field-title-description");
		expect(screen.getByRole("textbox")).toHaveAttribute(
			"aria-describedby",
			"field-title-description",
		);
	});

	it("renders no description node without metadata", () => {
		renderText({ label: "Title" }, "Hello");
		expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-describedby");
	});
});

describe("field chrome — property-row layout", () => {
	it("keeps the stacked layout by default", () => {
		renderText({ label: "Title" }, "Hello");
		const field = screen
			.getByRole("textbox")
			.closest("[data-slot='field-label'], [data-slot='field']");
		expect(field?.className ?? "").not.toContain("grid-cols-");
	});

	it("opts into the two-column row via metadata.layout", () => {
		renderText(
			{ label: "Title", metadata: { layout: "property-row" } },
			"Hello",
		);
		const input = screen.getByRole("textbox");
		expect(input.closest("[class*='grid-cols-']")).not.toBeNull();
	});
});

describe("field chrome — reset to default", () => {
	it("shows an enabled reset only when the value differs from the default and restores it on click", () => {
		const onChange = renderText({ label: "Title" }, "Changed copy");
		const reset = screen.getByTestId("ak-field-reset");
		expect(reset).toBeEnabled();
		expect(reset).toHaveAccessibleName("Reset to default");
		fireEvent.click(reset);
		expect(onChange).toHaveBeenCalledWith("Build faster");
	});

	it("keeps the reset invisible and disabled while the value equals the default", () => {
		renderText({ label: "Title" }, "Build faster");
		const reset = screen.getByTestId("ak-field-reset");
		expect(reset).toBeDisabled();
		expect(reset.className).toContain("invisible");
	});

	it("offers no reset when the component declares no default for the field", () => {
		puckState = {
			selectedItem: { type: "Hero", props: { id: "h-1" } },
			config: { components: { Hero: { defaultProps: {} } } },
		};
		renderText({ label: "Title" }, "Anything");
		expect(screen.queryByTestId("ak-field-reset")).toBeNull();
	});

	it("offers no reset for nested member paths even when a same-named default exists", () => {
		render(
			<EditorI18nProvider>
				<TextField
					field={{ type: "text", label: "Title" } as PuckTextField}
					value="Anything"
					onChange={vi.fn()}
					id="nested"
					name="items[0].title"
				/>
			</EditorI18nProvider>,
		);
		expect(screen.queryByTestId("ak-field-reset")).toBeNull();
	});

	it("resets a boolean Switch field to its configured default", () => {
		const onChange = vi.fn();
		render(
			<EditorI18nProvider>
				<RadioField
					field={
						{
							type: "radio",
							label: "Live",
							options: [
								{ label: "Yes", value: true },
								{ label: "No", value: false },
							],
						} as never
					}
					value={false}
					onChange={onChange}
					name="live"
				/>
			</EditorI18nProvider>,
		);
		const reset = screen.getByTestId("ak-field-reset");
		expect(reset).toBeEnabled();
		fireEvent.click(reset);
		expect(onChange).toHaveBeenCalledWith(true);
	});
});
