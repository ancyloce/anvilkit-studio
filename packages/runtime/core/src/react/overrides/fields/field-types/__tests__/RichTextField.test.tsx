/**
 * @file Tests for the `richtext` field override (report 0003, P1-5).
 *
 * The TipTap editor itself is lazy-loaded behind a `Suspense` boundary, so the
 * field renders its label + a loading placeholder synchronously and resolves
 * the editor asynchronously.
 */

import type { RichtextField as PuckRichtextField } from "@puckeditor/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultFieldTypes, RichTextField } from "../index";
import type { FieldRendererProps } from "../TextField";

// react-library preset has RTL auto-cleanup OFF.
afterEach(cleanup);

const field = {
	type: "richtext",
	label: "Body",
} as unknown as PuckRichtextField;

type Props = FieldRendererProps<PuckRichtextField, string | undefined>;

function renderField(overrides: Partial<Props> = {}) {
	const props = {
		field,
		value: "<p>Hello</p>",
		onChange: vi.fn(),
		id: "field-body",
		name: "body",
		readOnly: false,
		...overrides,
	} as unknown as Props;
	return render(<RichTextField {...props} />);
}

describe("richtext field registration", () => {
	it("registers a richtext renderer in the default field types", () => {
		expect(typeof (defaultFieldTypes as Record<string, unknown>).richtext).toBe(
			"function",
		);
	});
});

describe("<RichTextField>", () => {
	it("renders the field label", () => {
		renderField();
		expect(screen.getByText("Body")).toBeInTheDocument();
	});

	it("lazy-loads the TipTap editor behind Suspense", async () => {
		renderField();
		// The editor container appears once the lazy chunk resolves and TipTap
		// mounts in an effect (immediatelyRender: false).
		await waitFor(
			() => expect(screen.getByTestId("ak-richtext")).toBeInTheDocument(),
			{ timeout: 5000 },
		);
	});

	it("hides the toolbar and disables editing when readOnly", async () => {
		const { container } = renderField({ readOnly: true });
		await waitFor(
			() => expect(screen.getByTestId("ak-richtext")).toBeInTheDocument(),
			{ timeout: 5000 },
		);
		expect(
			screen.queryByRole("toolbar", { name: "Text formatting" }),
		).not.toBeInTheDocument();
		// The ProseMirror surface must not be editable in read-only mode.
		const editable = container.querySelector(".ak-richtext-content");
		expect(editable?.getAttribute("contenteditable")).toBe("false");
	});

	it("renders an editable surface when not readOnly", async () => {
		const { container } = renderField({ readOnly: false });
		await waitFor(
			() => expect(screen.getByTestId("ak-richtext")).toBeInTheDocument(),
			{ timeout: 5000 },
		);
		const editable = container.querySelector(".ak-richtext-content");
		expect(editable?.getAttribute("contenteditable")).toBe("true");
		expect(
			screen.getByRole("toolbar", { name: "Text formatting" }),
		).toBeInTheDocument();
	});
});
