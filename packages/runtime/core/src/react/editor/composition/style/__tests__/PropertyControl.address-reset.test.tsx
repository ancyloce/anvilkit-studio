/**
 * @file Regression coverage for review 0037 P2-7 — transient control
 * drafts belong to a field address, not to its rendered durable value.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StyleFieldHandle } from "../controls/handle.js";
import { StylePropertyControl } from "../PropertyControl.js";

vi.mock("@/state/editor-i18n-context", () => ({
	useMsg: () => (key: string) => key,
}));

let numberValue = 16;
const numberField: Omit<StyleFieldHandle<number>, "state"> = {
	commit: vi.fn(),
	reset: vi.fn(),
	layer: "base",
};

const tracks = [{ kind: "fr" as const, value: 1 }];
const tracksField: StyleFieldHandle<typeof tracks> = {
	state: {
		kind: "value",
		value: tracks,
		resolved: { value: tracks, source: "base", inherited: false },
		writtenAtLayer: true,
	},
	commit: vi.fn(),
	reset: vi.fn(),
	layer: "base",
};

vi.mock("../use-style-field.js", async () => {
	const actual = await vi.importActual("../use-style-field.js");
	return {
		...actual,
		useStyleField: (_address: unknown, selector: { property?: string }) =>
			selector.property === "columns"
				? tracksField
				: {
						...numberField,
						state: {
							kind: "value",
							value: numberValue,
							resolved: {
								value: numberValue,
								source: "base",
								inherited: false,
							},
							writtenAtLayer: true,
						},
					},
	};
});

afterEach(() => {
	cleanup();
	numberValue = 16;
});

describe("StylePropertyControl — field-address draft identity (0037 P2-7)", () => {
	it("drops an in-progress draft when selection moves to an equal-valued field", () => {
		const { rerender } = render(
			<StylePropertyControl
				address={{ nodeIds: ["node-a"], targetId: "root", layer: "base" }}
				property="zIndex"
			/>,
		);
		const input = screen.getByTestId("ak-style-prop-zIndex");
		fireEvent.change(input, { target: { value: "draft from node A" } });
		expect(input).toHaveValue("draft from node A");

		rerender(
			<StylePropertyControl
				address={{ nodeIds: ["node-b"], targetId: "root", layer: "base" }}
				property="zIndex"
			/>,
		);

		// Both nodes durably store 16. A value-keyed reset effect therefore
		// cannot see the address transition; the keyed subtree must remount.
		expect(screen.getByTestId("ak-style-prop-zIndex")).toHaveValue("16");
	});

	it("keeps a draft when only selection order changes", () => {
		const { rerender } = render(
			<StylePropertyControl
				address={{
					nodeIds: ["node-a", "node-b"],
					targetId: "root",
					layer: "base",
				}}
				property="zIndex"
			/>,
		);
		fireEvent.change(screen.getByTestId("ak-style-prop-zIndex"), {
			target: { value: "17" },
		});

		rerender(
			<StylePropertyControl
				address={{
					nodeIds: ["node-b", "node-a"],
					targetId: "root",
					layer: "base",
				}}
				property="zIndex"
			/>,
		);

		expect(screen.getByTestId("ak-style-prop-zIndex")).toHaveValue("17");
	});

	it("resets a nested row draft when its field address changes", () => {
		const { rerender } = render(
			<StylePropertyControl
				address={{ nodeIds: ["node-a"], targetId: "root", layer: "base" }}
				property="columns"
			/>,
		);
		fireEvent.change(
			screen.getByLabelText("studio.editor.inspector.layout.track.size"),
			{ target: { value: "draft from node A" } },
		);

		rerender(
			<StylePropertyControl
				address={{ nodeIds: ["node-b"], targetId: "root", layer: "base" }}
				property="columns"
			/>,
		);

		expect(
			screen.getByLabelText("studio.editor.inspector.layout.track.size"),
		).toHaveValue("1");
	});

	it("still resets a draft for an external update at the same address", () => {
		const address = {
			nodeIds: ["node-a"],
			targetId: "root",
			layer: "base" as const,
		};
		const { rerender } = render(
			<StylePropertyControl address={address} property="zIndex" />,
		);
		fireEvent.change(screen.getByTestId("ak-style-prop-zIndex"), {
			target: { value: "17" },
		});

		numberValue = 24;
		rerender(<StylePropertyControl address={address} property="zIndex" />);

		expect(screen.getByTestId("ak-style-prop-zIndex")).toHaveValue("24");
	});
});
