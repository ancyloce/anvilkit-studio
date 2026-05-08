/**
 * @file ArrayField add / remove / duplicate / reorder semantics —
 * the resulting array must preserve item identity (Phase 3
 * acceptance + PRD §9.5).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { ArrayField } from "@/overrides/fields/field-types/ArrayField";

const FIELD = {
	type: "array",
	arrayFields: { label: { type: "text" } },
	defaultItemProps: { label: "" },
} as const;

const PLAN_FIELD = {
	type: "array",
	defaultItemProps: { name: "New plan", price: "$0" },
	getItemSummary: (item: { readonly name?: string }, index?: number) =>
		item.name || `Plan ${(index ?? 0) + 1}`,
	arrayFields: {
		name: { type: "text", label: "Name" },
		price: { type: "text", label: "Price" },
	},
} as const;

function createDataTransfer(): DataTransfer {
	const data = new Map<string, string>();

	return {
		dropEffect: "none",
		effectAllowed: "uninitialized",
		files: [] as unknown as FileList,
		items: [] as unknown as DataTransferItemList,
		types: [] as unknown as readonly string[],
		clearData: vi.fn((format?: string) => {
			if (format === undefined) data.clear();
			else data.delete(format);
		}),
		getData: vi.fn((format: string) => data.get(format) ?? ""),
		setData: vi.fn((format: string, value: string) => {
			data.set(format, value);
		}),
		setDragImage: vi.fn(),
	} as unknown as DataTransfer;
}

describe("ArrayField", () => {
	it("renders one row per item", () => {
		render(
			<ArrayField
				// biome-ignore lint/suspicious/noExplicitAny: test fixture
				field={FIELD as any}
				value={[
					{ id: "a", label: "First" },
					{ id: "b", label: "Second" },
				]}
				onChange={vi.fn()}
				name="items"
			>
				<div data-testid="child-0">child0</div>
				<div data-testid="child-1">child1</div>
			</ArrayField>,
		);
		expect(screen.getByText("Item 1")).toBeInTheDocument();
		expect(screen.getByText("Item 2")).toBeInTheDocument();
	});

	it("appends a default-shaped item on add", () => {
		const onChange = vi.fn();
		render(
			<ArrayField
				// biome-ignore lint/suspicious/noExplicitAny: test fixture
				field={FIELD as any}
				value={[{ id: "a", label: "First" }]}
				onChange={onChange}
				name="items"
			>
				<div />
			</ArrayField>,
		);
		fireEvent.click(screen.getByText("Add item"));
		expect(onChange).toHaveBeenCalledTimes(1);
		const next = onChange.mock.calls[0]?.[0] as readonly Record<
			string,
			unknown
		>[];
		expect(next).toHaveLength(2);
		expect(next[0]).toEqual({ id: "a", label: "First" });
		expect(next[1]).toEqual({ label: "" });
	});

	it("opens the new item's property fields on add", () => {
		function Harness() {
			const [items, setItems] = useState<readonly Record<string, unknown>[]>(
				[],
			);

			return (
				<ArrayField
					// biome-ignore lint/suspicious/noExplicitAny: test fixture
					field={PLAN_FIELD as any}
					value={items}
					onChange={(next) =>
						setItems(next as readonly Record<string, unknown>[])
					}
					name="plans"
				/>
			);
		}

		render(<Harness />);
		fireEvent.click(screen.getByText("Add item"));

		expect(screen.getByDisplayValue("New plan")).toBeInTheDocument();
		expect(screen.getByDisplayValue("$0")).toBeInTheDocument();
	});

	it("opens the selected item's fields and updates that item", () => {
		const onChange = vi.fn();
		const items = [
			{ name: "Basic", price: "$9" },
			{ name: "Pro", price: "$29" },
		];

		render(
			<ArrayField
				// biome-ignore lint/suspicious/noExplicitAny: test fixture
				field={PLAN_FIELD as any}
				value={items}
				onChange={onChange}
				name="plans"
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Edit Pro" }));

		expect(screen.getByDisplayValue("Pro")).toBeInTheDocument();
		expect(screen.getByDisplayValue("$29")).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText("Price"), {
			target: { value: "$39" },
		});

		const next = onChange.mock.calls[0]?.[0] as readonly Record<
			string,
			unknown
		>[];
		expect(next).toEqual([
			{ name: "Basic", price: "$9" },
			{ name: "Pro", price: "$39" },
		]);
		expect(next[0]).toBe(items[0]);
	});

	it("removes the indexed item on delete", () => {
		const onChange = vi.fn();
		const items = [
			{ id: "a", label: "First" },
			{ id: "b", label: "Second" },
		];
		render(
			<ArrayField
				// biome-ignore lint/suspicious/noExplicitAny: test fixture
				field={FIELD as any}
				value={items}
				onChange={onChange}
				name="items"
			>
				<div />
				<div />
			</ArrayField>,
		);
		// Two "Remove" buttons — click the second (Item 2)
		fireEvent.click(screen.getAllByLabelText("Remove")[1]!);
		const next = onChange.mock.calls[0]?.[0] as readonly Record<
			string,
			unknown
		>[];
		expect(next).toHaveLength(1);
		// First item identity preserved
		expect(next[0]).toBe(items[0]);
	});

	it("duplicates the indexed item, preserving identity of the source", () => {
		const onChange = vi.fn();
		const items = [{ id: "a", label: "First" }];
		render(
			<ArrayField
				// biome-ignore lint/suspicious/noExplicitAny: test fixture
				field={FIELD as any}
				value={items}
				onChange={onChange}
				name="items"
			>
				<div />
			</ArrayField>,
		);
		fireEvent.click(screen.getByLabelText("Duplicate"));
		const next = onChange.mock.calls[0]?.[0] as readonly Record<
			string,
			unknown
		>[];
		expect(next).toHaveLength(2);
		expect(next[0]).toBe(items[0]);
		// The duplicate is a shallow ref-equal copy by spec — our impl
		// inserts the same reference, which is fine for v1.
		expect(next[1]).toBe(items[0]);
	});

	it("reorders items from the handle, preserving identity of every item", () => {
		const onChange = vi.fn();
		const items = [
			{ id: "a", label: "First" },
			{ id: "b", label: "Second" },
			{ id: "c", label: "Third" },
		];
		render(
			<ArrayField
				// biome-ignore lint/suspicious/noExplicitAny: test fixture
				field={FIELD as any}
				value={items}
				onChange={onChange}
				name="items"
			>
				<div />
				<div />
				<div />
			</ArrayField>,
		);
		// Move the second item up (swap with the first).
		fireEvent.keyDown(screen.getByLabelText("Reorder Item 2"), {
			key: "ArrowUp",
		});
		const next = onChange.mock.calls[0]?.[0] as readonly Record<
			string,
			unknown
		>[];
		expect(next).toEqual([items[1], items[0], items[2]]);
		expect(next[0]).toBe(items[1]);
		expect(next[1]).toBe(items[0]);
		expect(next[2]).toBe(items[2]);
	});

	it("reorders items by dragging a row handle", () => {
		const onChange = vi.fn();
		const items = [
			{ id: "a", label: "First" },
			{ id: "b", label: "Second" },
			{ id: "c", label: "Third" },
		];
		render(
			<ArrayField
				// biome-ignore lint/suspicious/noExplicitAny: test fixture
				field={FIELD as any}
				value={items}
				onChange={onChange}
				name="items"
			>
				<div />
				<div />
				<div />
			</ArrayField>,
		);

		const dataTransfer = createDataTransfer();
		const targetRow = screen
			.getByText("Item 3")
			.closest('[role="listitem"]') as HTMLElement;

		fireEvent.dragStart(screen.getByLabelText("Reorder Item 1"), {
			dataTransfer,
		});
		fireEvent.dragOver(targetRow, { dataTransfer });
		fireEvent.drop(targetRow, { dataTransfer });

		const next = onChange.mock.calls[0]?.[0] as readonly Record<
			string,
			unknown
		>[];
		expect(next).toEqual([items[1], items[2], items[0]]);
		expect(next[0]).toBe(items[1]);
		expect(next[1]).toBe(items[2]);
		expect(next[2]).toBe(items[0]);
	});

	it("does not mutate when readOnly", () => {
		const onChange = vi.fn();
		render(
			<ArrayField
				// biome-ignore lint/suspicious/noExplicitAny: test fixture
				field={FIELD as any}
				value={[{ id: "a", label: "First" }]}
				onChange={onChange}
				readOnly
				name="items"
			>
				<div />
			</ArrayField>,
		);
		// All controls hidden under readOnly — query for "Add item" returns null
		expect(screen.queryByText("Add item")).toBeNull();
		expect(onChange).not.toHaveBeenCalled();
	});
});
