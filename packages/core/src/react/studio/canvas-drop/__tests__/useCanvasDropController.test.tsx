/**
 * @file Tests for `useCanvasDropController` — resolving the dropped-onto
 * Puck component (seeing past Puck's body-level overlay portal),
 * dispatching `replace`, the always-preventDefault DnD contract,
 * highlight + failure toasts, and listener teardown. Mock shape follows
 * `state/__tests__/useInsertSnippet.test.tsx`.
 */

import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorI18nStoreProvider } from "@/state/editor-i18n-store";
import { encodeDropPayload } from "../drag-payload";
import {
	DROP_TARGET_ATTR,
	useCanvasDropController,
} from "../useCanvasDropController";
import { createDataTransfer, makeDragEvent } from "./data-transfer-double";

const dispatch = vi.fn();
const getItemById = vi.fn();
const getSelectorForId = vi.fn();
const snapshot = {
	dispatch,
	getItemById,
	getSelectorForId,
	config: { components: { Text: { fields: { text: { type: "text" } } } } },
};

const toastWarning = vi.fn();

vi.mock("@puckeditor/core", () => ({
	useGetPuck: () => () => snapshot,
}));

vi.mock("sonner", () => ({
	toast: {
		warning: (m: string) => toastWarning(m),
		error: vi.fn(),
		success: vi.fn(),
		info: vi.fn(),
	},
}));

const wrapper = ({ children }: { children: ReactNode }) => (
	<EditorI18nStoreProvider>{children}</EditorI18nStoreProvider>
);

const RECT = {
	left: 0,
	top: 0,
	right: 100,
	bottom: 100,
	width: 100,
	height: 100,
	x: 0,
	y: 0,
	toJSON: () => ({}),
} as DOMRect;

function rectAt(left: number, top: number, w: number, h: number): DOMRect {
	return {
		left,
		top,
		right: left + w,
		bottom: top + h,
		width: w,
		height: h,
		x: left,
		y: top,
		toJSON: () => ({}),
	} as DOMRect;
}

let target: HTMLDivElement;

beforeEach(() => {
	target = document.createElement("div");
	target.setAttribute("data-puck-component", "t-1");
	target.getBoundingClientRect = () => RECT;
	document.body.appendChild(target);
	// jsdom has no layout engine — stub both point APIs deterministically.
	document.elementFromPoint = vi.fn(() => target);
	document.elementsFromPoint = vi.fn(() => [target]);
});

afterEach(() => {
	// Unmount every rendered hook so its controller detaches its
	// document listeners before the next test (no global RTL
	// auto-cleanup is registered in this setup).
	cleanup();
	dispatch.mockReset();
	getItemById.mockReset();
	getSelectorForId.mockReset();
	toastWarning.mockReset();
	vi.restoreAllMocks();
	Reflect.deleteProperty(document, "elementFromPoint");
	Reflect.deleteProperty(document, "elementsFromPoint");
	for (const el of Array.from(
		document.querySelectorAll("[data-puck-component],[data-puck-overlay]"),
	)) {
		el.remove();
	}
});

function dropText(body = "Dropped copy."): void {
	const dt = createDataTransfer();
	encodeDropPayload(dt, { kind: "text", body });
	document.dispatchEvent(makeDragEvent("drop", dt, { clientX: 5, clientY: 5 }));
}

describe("useCanvasDropController", () => {
	it("dispatches a Puck replace targeting the dropped-onto component", () => {
		getItemById.mockReturnValue({
			type: "Text",
			props: { id: "t-1", text: "old" },
		});
		getSelectorForId.mockReturnValue({ index: 2, zone: "default-zone" });

		renderHook(() => useCanvasDropController(document), { wrapper });
		dropText();

		expect(dispatch).toHaveBeenCalledTimes(1);
		const action = dispatch.mock.calls[0]?.[0] as {
			type: string;
			destinationIndex: number;
			destinationZone: string;
			data: { props: Record<string, unknown> };
		};
		expect(action.type).toBe("replace");
		expect(action.destinationIndex).toBe(2);
		expect(action.destinationZone).toBe("default-zone");
		expect(action.data.props["text"]).toBe("Dropped copy.");
		expect(action.data.props["id"]).toBe("t-1");
		expect(toastWarning).not.toHaveBeenCalled();
	});

	it("resolves the component via geometry when Puck's overlay is on top (the production bug)", () => {
		// Puck portals a body-level [data-puck-overlay] sibling that
		// covers the component; it is NOT inside [data-puck-component].
		const overlay = document.createElement("div");
		overlay.setAttribute("data-puck-overlay", "true");
		overlay.getBoundingClientRect = () => RECT;
		document.body.appendChild(overlay);
		document.elementsFromPoint = vi.fn(() => [overlay]);

		getItemById.mockReturnValue({
			type: "Text",
			props: { id: "t-1", text: "old" },
		});
		getSelectorForId.mockReturnValue({ index: 1, zone: "default-zone" });

		renderHook(() => useCanvasDropController(document), { wrapper });
		dropText("Replaced past overlay.");

		expect(dispatch).toHaveBeenCalledTimes(1);
		const action = dispatch.mock.calls[0]?.[0] as {
			type: string;
			data: { props: Record<string, unknown> };
		};
		expect(action.type).toBe("replace");
		expect(action.data.props["text"]).toBe("Replaced past overlay.");
		expect(action.data.props["id"]).toBe("t-1");
		expect(toastWarning).not.toHaveBeenCalled();
	});

	it("always preventDefaults dragover with our payload so the browser fires drop", () => {
		// No component under the pointer at all.
		target.getBoundingClientRect = () => rectAt(500, 500, 10, 10);
		document.elementsFromPoint = vi.fn(() => []);
		document.elementFromPoint = vi.fn(() => null);

		renderHook(() => useCanvasDropController(document), { wrapper });
		const dt = createDataTransfer();
		encodeDropPayload(dt, { kind: "text", body: "x" });
		const ev = makeDragEvent("dragover", dt, { clientX: 5, clientY: 5 });
		document.dispatchEvent(ev);

		expect(ev.defaultPrevented).toBe(true);
		expect(dt.dropEffect).toBe("copy");
		expect(target.hasAttribute(DROP_TARGET_ATTR)).toBe(false);
	});

	it("picks the deepest (smallest-area) component for nested zones", () => {
		const inner = document.createElement("div");
		inner.setAttribute("data-puck-component", "inner-1");
		inner.getBoundingClientRect = () => rectAt(0, 0, 20, 20);
		target.appendChild(inner);
		// Force the geometry fallback (overlay-only hit stack).
		const overlay = document.createElement("div");
		overlay.setAttribute("data-puck-overlay", "true");
		document.body.appendChild(overlay);
		document.elementsFromPoint = vi.fn(() => [overlay]);

		getItemById.mockImplementation((id: string) =>
			id === "inner-1"
				? { type: "Text", props: { id, text: "old" } }
				: undefined,
		);
		getSelectorForId.mockReturnValue({ index: 0, zone: "default-zone" });

		renderHook(() => useCanvasDropController(document), { wrapper });
		const dt = createDataTransfer();
		encodeDropPayload(dt, { kind: "text", body: "nested" });
		document.dispatchEvent(
			makeDragEvent("drop", dt, { clientX: 5, clientY: 5 }),
		);

		const last = dispatch.mock.calls.at(-1)?.[0] as {
			data: { props: Record<string, unknown> };
		};
		expect(last.data.props["id"]).toBe("inner-1");
		expect(last.data.props["text"]).toBe("nested");
	});

	it("warns and does not dispatch on an incompatible target", () => {
		getItemById.mockReturnValue({
			type: "Hero",
			props: { id: "t-1", subtitle: "x" },
		});
		getSelectorForId.mockReturnValue({ index: 0, zone: "default-zone" });

		renderHook(() => useCanvasDropController(document), { wrapper });
		dropText();

		expect(dispatch).not.toHaveBeenCalled();
		expect(toastWarning).toHaveBeenCalledTimes(1);
	});

	it("warns when there is no component under the pointer", () => {
		target.getBoundingClientRect = () => rectAt(500, 500, 10, 10);
		document.elementsFromPoint = vi.fn(() => []);
		document.elementFromPoint = vi.fn(() => null);
		renderHook(() => useCanvasDropController(document), { wrapper });
		dropText();

		expect(dispatch).not.toHaveBeenCalled();
		expect(toastWarning).toHaveBeenCalledTimes(1);
	});

	it("highlights a compatible target during dragover", () => {
		getItemById.mockReturnValue({
			type: "Text",
			props: { id: "t-1", text: "old" },
		});
		renderHook(() => useCanvasDropController(document), { wrapper });

		const dt = createDataTransfer();
		encodeDropPayload(dt, { kind: "text", body: "x" });
		document.dispatchEvent(
			makeDragEvent("dragover", dt, { clientX: 1, clientY: 1 }),
		);

		expect(target.hasAttribute(DROP_TARGET_ATTR)).toBe(true);

		document.dispatchEvent(
			makeDragEvent("dragleave", dt, {
				clientX: 0,
				clientY: 0,
				relatedTarget: null,
			}),
		);
		expect(target.hasAttribute(DROP_TARGET_ATTR)).toBe(false);
	});

	it("removes listeners on unmount", () => {
		getItemById.mockReturnValue({
			type: "Text",
			props: { id: "t-1", text: "old" },
		});
		getSelectorForId.mockReturnValue({ index: 0, zone: "default-zone" });

		const { unmount } = renderHook(() => useCanvasDropController(document), {
			wrapper,
		});
		unmount();
		dropText();

		expect(dispatch).not.toHaveBeenCalled();
	});

	it("ignores foreign (non-anvilkit) drags", () => {
		renderHook(() => useCanvasDropController(document), { wrapper });
		const dt = createDataTransfer();
		dt.setData("text/plain", "hello");
		const ev = makeDragEvent("dragover", dt, { clientX: 5, clientY: 5 });
		document.dispatchEvent(ev);
		document.dispatchEvent(
			makeDragEvent("drop", dt, { clientX: 5, clientY: 5 }),
		);

		expect(ev.defaultPrevented).toBe(false);
		expect(dispatch).not.toHaveBeenCalled();
		expect(toastWarning).not.toHaveBeenCalled();
	});
});
