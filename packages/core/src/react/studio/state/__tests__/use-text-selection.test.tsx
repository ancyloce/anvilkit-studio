/**
 * @file Tests for `useSelectedItem` / `useTextSelection`.
 *
 * Mocks Puck's `createUsePuck` selector hook so the test controls the
 * `selectedItem` value the adapter sees. The compatibility predicate
 * is locked in v1 to `type === "Text"` with a string `text` prop.
 */

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSelectedItem, useTextSelection } from "@/state/use-text-selection";

let mockSelectedItem: {
	readonly type: string;
	readonly props: Record<string, unknown>;
} | null = null;

vi.mock("@puckeditor/core", () => ({
	createUsePuck:
		() =>
		<T,>(
			selector: (state: {
				readonly selectedItem: typeof mockSelectedItem;
			}) => T,
		): T =>
			selector({ selectedItem: mockSelectedItem }),
}));

afterEach(() => {
	mockSelectedItem = null;
});

describe("useSelectedItem", () => {
	it("returns null when nothing is selected", () => {
		mockSelectedItem = null;
		const { result } = renderHook(() => useSelectedItem());
		expect(result.current).toBeNull();
	});

	it("returns the live selected item", () => {
		mockSelectedItem = { type: "Text", props: { id: "t-1", text: "hi" } };
		const { result } = renderHook(() => useSelectedItem());
		expect(result.current).toEqual(mockSelectedItem);
	});
});

describe("useTextSelection", () => {
	it("reports incompatible when nothing is selected", () => {
		mockSelectedItem = null;
		const { result } = renderHook(() => useTextSelection());
		expect(result.current.selected).toBeNull();
		expect(result.current.isCompatibleTextSelection).toBe(false);
	});

	it("reports incompatible when the selection is a non-Text component", () => {
		mockSelectedItem = { type: "Hero", props: { id: "h-1", text: "ignored" } };
		const { result } = renderHook(() => useTextSelection());
		expect(result.current.isCompatibleTextSelection).toBe(false);
	});

	it("reports incompatible when the Text node has a non-string `text` prop", () => {
		mockSelectedItem = { type: "Text", props: { id: "t-1", text: 42 } };
		const { result } = renderHook(() => useTextSelection());
		expect(result.current.isCompatibleTextSelection).toBe(false);
	});

	it("reports compatible when the selection is a Text node with a string `text` prop", () => {
		mockSelectedItem = { type: "Text", props: { id: "t-1", text: "Hello" } };
		const { result } = renderHook(() => useTextSelection());
		expect(result.current.isCompatibleTextSelection).toBe(true);
	});
});
