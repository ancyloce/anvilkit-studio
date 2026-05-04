/**
 * @file ArrayField add / remove / duplicate / reorder semantics —
 * the resulting array must preserve item identity (Phase 3
 * acceptance + PRD §9.5).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { ArrayField } from "@/overrides/fields/field-types/ArrayField";

const FIELD = {
	type: "array",
	arrayFields: { label: { type: "text" } },
	defaultItemProps: { label: "" },
} as const;

describe("ArrayField", () => {
	it("renders one section per item", () => {
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

	it("reorders items, preserving identity of every item", () => {
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
		fireEvent.click(screen.getAllByLabelText("Move up")[1]!);
		const next = onChange.mock.calls[0]?.[0] as readonly Record<
			string,
			unknown
		>[];
		expect(next).toEqual([items[1], items[0], items[2]]);
		expect(next[0]).toBe(items[1]);
		expect(next[1]).toBe(items[0]);
		expect(next[2]).toBe(items[2]);
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
