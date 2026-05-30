/**
 * @file Tests for `useInsertSnippet` — the snippet-to-canvas dispatch
 * command. Verifies the toast-on-incompatible branch and the Puck
 * `replace` dispatch shape (including selector lookup via
 * `getSelectorForId`).
 */

import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorI18nStoreProvider } from "@/state/editor-i18n-store";
import { useInsertSnippet } from "@/state/use-insert-snippet";
import type { StudioCopySnippet } from "@/types/sidebar";

const dispatch = vi.fn();
const getSelectorForId = vi.fn();
const mockSnapshot: {
	selectedItem: {
		readonly type: string;
		readonly props: Record<string, unknown>;
	} | null;
	dispatch: typeof dispatch;
	getSelectorForId: typeof getSelectorForId;
} = {
	selectedItem: null,
	dispatch,
	getSelectorForId,
};

const toastWarning = vi.fn();

vi.mock("@puckeditor/core", () => ({
	useGetPuck: () => () => mockSnapshot,
}));

vi.mock("sonner", () => ({
	toast: {
		warning: (msg: string) => toastWarning(msg),
		error: vi.fn(),
		success: vi.fn(),
		info: vi.fn(),
	},
}));

afterEach(() => {
	dispatch.mockReset();
	getSelectorForId.mockReset();
	toastWarning.mockReset();
	mockSnapshot.selectedItem = null;
});

const wrapper = ({ children }: { children: ReactNode }) => (
	<EditorI18nStoreProvider>{children}</EditorI18nStoreProvider>
);

const snippet: StudioCopySnippet = {
	id: "s-1",
	category: "basic",
	title: "T",
	body: "Replacement body.",
};

describe("useInsertSnippet", () => {
	it("toasts and does not dispatch when nothing is selected", () => {
		mockSnapshot.selectedItem = null;
		const { result } = renderHook(() => useInsertSnippet(), { wrapper });
		result.current(snippet);
		expect(dispatch).not.toHaveBeenCalled();
		expect(toastWarning).toHaveBeenCalledTimes(1);
		expect(toastWarning.mock.calls[0]?.[0]).toBe(
			"Select a text element on the canvas to insert copy.",
		);
	});

	it("toasts when the selected item is not a Text component", () => {
		mockSnapshot.selectedItem = {
			type: "Hero",
			props: { id: "h-1", text: "irrelevant" },
		};
		const { result } = renderHook(() => useInsertSnippet(), { wrapper });
		result.current(snippet);
		expect(dispatch).not.toHaveBeenCalled();
		expect(toastWarning).toHaveBeenCalledTimes(1);
	});

	it("toasts when the Text node's `text` prop is not a string", () => {
		mockSnapshot.selectedItem = {
			type: "Text",
			props: { id: "t-1", text: 42 },
		};
		const { result } = renderHook(() => useInsertSnippet(), { wrapper });
		result.current(snippet);
		expect(dispatch).not.toHaveBeenCalled();
		expect(toastWarning).toHaveBeenCalledTimes(1);
	});

	it("toasts when getSelectorForId yields undefined (selection moved)", () => {
		mockSnapshot.selectedItem = {
			type: "Text",
			props: { id: "t-1", text: "Old body" },
		};
		getSelectorForId.mockReturnValue(undefined);
		const { result } = renderHook(() => useInsertSnippet(), { wrapper });
		result.current(snippet);
		expect(dispatch).not.toHaveBeenCalled();
		expect(toastWarning).toHaveBeenCalledTimes(1);
	});

	it("dispatches a Puck `replace` action targeting the selected node's selector", () => {
		mockSnapshot.selectedItem = {
			type: "Text",
			props: { id: "t-99", text: "Old body" },
		};
		getSelectorForId.mockReturnValue({ index: 3, zone: "default-zone" });

		const { result } = renderHook(() => useInsertSnippet(), { wrapper });
		result.current(snippet);

		expect(getSelectorForId).toHaveBeenCalledWith("t-99");
		expect(dispatch).toHaveBeenCalledTimes(1);
		const action = dispatch.mock.calls[0]?.[0] as {
			readonly type: string;
			readonly destinationIndex: number;
			readonly destinationZone: string;
			readonly data: {
				readonly type: string;
				readonly props: Record<string, unknown>;
			};
		};
		expect(action.type).toBe("replace");
		expect(action.destinationIndex).toBe(3);
		expect(action.destinationZone).toBe("default-zone");
		expect(action.data.type).toBe("Text");
		expect(action.data.props["id"]).toBe("t-99");
		expect(action.data.props["text"]).toBe("Replacement body.");
		expect(toastWarning).not.toHaveBeenCalled();
	});

	it("dispatches a Puck `replace` action targeting a nested zone", () => {
		mockSnapshot.selectedItem = {
			type: "Text",
			props: { id: "nested-t", text: "Old" },
		};
		getSelectorForId.mockReturnValue({
			index: 1,
			zone: "row-1:contents",
		});

		const { result } = renderHook(() => useInsertSnippet(), { wrapper });
		result.current(snippet);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const action = dispatch.mock.calls[0]?.[0] as {
			readonly destinationZone: string;
			readonly destinationIndex: number;
		};
		expect(action.destinationZone).toBe("row-1:contents");
		expect(action.destinationIndex).toBe(1);
	});
});
