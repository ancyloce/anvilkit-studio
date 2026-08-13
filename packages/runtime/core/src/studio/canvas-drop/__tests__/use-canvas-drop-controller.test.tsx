/**
 * @file Tests for `useCanvasDropController` — resolving the dropped-onto
 * Puck component (seeing past Puck's body-level overlay portal),
 * dispatching `replace`, the always-preventDefault DnD contract,
 * highlight + failure toasts, and listener teardown. Mock shape follows
 * `state/__tests__/useInsertSnippet.test.tsx`.
 */

import type { Data } from "@puckeditor/core";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import { createStudioEditorBridge } from "../../../react/editor/bridge.js";
import { StudioEditorBridgeContext } from "../../../react/editor/use-studio-editor.js";
import { encodeDropPayload } from "../drag-payload";
import {
	DROP_TARGET_ATTR,
	useCanvasDropController,
} from "../use-canvas-drop-controller";
import { createDataTransfer, makeDragEvent } from "./data-transfer-double";

const dispatch = vi.fn();
const getItemById = vi.fn();
const getSelectorForId = vi.fn();
let committedData: Data | undefined;
const snapshot = {
	dispatch,
	getItemById,
	getSelectorForId,
	config: {
		root: { fields: {} },
		components: { Text: { fields: { text: { type: "text" } } } },
	},
	get appState() {
		const ids = Array.from(
			document.querySelectorAll<HTMLElement>("[data-puck-component]"),
		)
			.map((element) => element.getAttribute("data-puck-component"))
			.filter((id): id is string => id !== null);
		const items = ids
			.map((id) => getItemById(id))
			.filter((item): item is Record<string, unknown> => item !== undefined);
		for (const item of items) {
			const type = item["type"];
			const components = snapshot.config.components as Record<string, unknown>;
			if (typeof type === "string" && !Object.hasOwn(components, type)) {
				components[type] = { fields: {} };
			}
		}
		return {
			data: {
				root: { props: {} },
				content: items,
			},
		};
	},
};

const toastWarning = vi.fn();

vi.mock("@puckeditor/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@puckeditor/core")>()),
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
	<EditorI18nProvider>{children}</EditorI18nProvider>
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
	committedData = undefined;
	dispatch.mockImplementation(
		(action: { data: Data | ((previous: Data) => Data) }) => {
			committedData =
				typeof action.data === "function"
					? action.data(snapshot.appState.data as Data)
					: action.data;
		},
	);
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

function committedProps(nodeId = "t-1"): Record<string, unknown> {
	const item = (
		committedData?.content as
			| readonly { props?: Record<string, unknown> }[]
			| undefined
	)?.find((entry) => entry.props?.id === nodeId);
	if (item?.props === undefined)
		throw new Error("Expected committed node props");
	return item.props;
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
		const action = dispatch.mock.calls[0]?.[0] as { type: string };
		expect(action.type).toBe("setData");
		expect(committedProps()["text"]).toBe("Dropped copy.");
		expect(committedProps()["id"]).toBe("t-1");
		expect(toastWarning).not.toHaveBeenCalled();
	});

	it("refuses the drop at the live collaboration writer gate", () => {
		getItemById.mockReturnValue({
			type: "Text",
			props: { id: "t-1", text: "old" },
		});
		const bridge = createStudioEditorBridge();
		bridge.getWriterGateError = () => ({
			code: "EDITOR_COLLAB_ENCODING_UNSUPPORTED",
			message: "writers closed",
			severity: "error",
			recoverable: true,
		});
		const gatedWrapper = ({ children }: { children: ReactNode }) => (
			<StudioEditorBridgeContext value={bridge}>
				<EditorI18nProvider>{children}</EditorI18nProvider>
			</StudioEditorBridgeContext>
		);

		renderHook(() => useCanvasDropController(document), {
			wrapper: gatedWrapper,
		});
		dropText();

		expect(dispatch).not.toHaveBeenCalled();
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
		const action = dispatch.mock.calls[0]?.[0] as { type: string };
		expect(action.type).toBe("setData");
		expect(committedProps()["text"]).toBe("Replaced past overlay.");
		expect(committedProps()["id"]).toBe("t-1");
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

		expect(committedProps("inner-1")["id"]).toBe("inner-1");
		expect(committedProps("inner-1")["text"]).toBe("nested");
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

	it("highlights a compatible target during dragover", async () => {
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

		// Highlight resolution is now coalesced into an animation frame
		// (perf: one DOM walk per frame, not per pointer-move). This
		// callback is queued after the controller's `flush`, so it
		// resolves once the highlight has been applied.
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => resolve());
		});
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

	function appendText(tag: string, r: DOMRect, text: string): void {
		const node = document.createElement(tag);
		node.appendChild(document.createTextNode(text));
		node.getBoundingClientRect = () => r;
		target.appendChild(node);
	}

	function dropAt(
		payload: Parameters<typeof encodeDropPayload>[1],
		x: number,
		y: number,
	): void {
		const dt = createDataTransfer();
		encodeDropPayload(dt, payload);
		document.dispatchEvent(
			makeDragEvent("drop", dt, { clientX: x, clientY: y }),
		);
	}

	it("replaces the corresponding prop under the cursor, not the first candidate", () => {
		appendText("h1", rectAt(0, 0, 100, 40), "Old headline");
		appendText("p", rectAt(0, 50, 100, 40), "Old description");
		getItemById.mockReturnValue({
			type: "Hero",
			props: {
				id: "t-1",
				headline: "Old headline",
				description: "Old description",
			},
		});
		getSelectorForId.mockReturnValue({ index: 0, zone: "default-zone" });

		renderHook(() => useCanvasDropController(document), { wrapper });
		dropAt({ kind: "text", body: "NEW BODY" }, 5, 60);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const props = committedProps();
		expect(props["description"]).toBe("NEW BODY");
		expect(props["headline"]).toBe("Old headline");
		expect(toastWarning).not.toHaveBeenCalled();
	});

	it("replaces an array-nested prop path", () => {
		appendText("span", rectAt(0, 0, 40, 20), "Pro");
		getItemById.mockReturnValue({
			type: "Pricing",
			props: {
				id: "t-1",
				plans: [
					{ id: "p0", name: "Free" },
					{ id: "p1", name: "Pro" },
				],
			},
		});
		getSelectorForId.mockReturnValue({ index: 0, zone: "default-zone" });

		renderHook(() => useCanvasDropController(document), { wrapper });
		dropAt({ kind: "text", body: "Team" }, 5, 5);

		const props = committedProps() as { plans: { name: string }[] };
		expect(props.plans[1]?.name).toBe("Team");
		expect(props.plans[0]?.name).toBe("Free");
	});

	it("replaces the matching image src and syncs a sibling alt", () => {
		const img = document.createElement("img");
		img.setAttribute("src", "/a.png");
		img.getBoundingClientRect = () => rectAt(0, 0, 50, 50);
		target.appendChild(img);
		getItemById.mockReturnValue({
			type: "Gallery",
			props: { id: "t-1", gallery: [{ id: "g0", src: "/a.png", alt: "A" }] },
		});
		getSelectorForId.mockReturnValue({ index: 0, zone: "default-zone" });

		renderHook(() => useCanvasDropController(document), { wrapper });
		dropAt({ kind: "image", url: "/new.png", alt: "New alt" }, 5, 5);

		const props = committedProps() as {
			gallery: { src: string; alt: string }[];
		};
		expect(props.gallery[0]?.src).toBe("/new.png");
		expect(props.gallery[0]?.alt).toBe("New alt");
	});

	it("declared InlineTextTarget wins over the heuristic (§26.1 precedence)", () => {
		const components = snapshot.config.components as Record<string, unknown>;
		const original = components["Text"];
		components["Text"] = {
			fields: { text: { type: "text" }, subtitle: { type: "text" } },
			metadata: {
				anvilkit: {
					editor: {
						styleTargets: { root: { label: "Text", properties: [] } },
						inlineText: [
							{ id: "subtitle", propPath: "subtitle", format: "plain" },
						],
					},
				},
			},
		};
		try {
			getItemById.mockReturnValue({
				type: "Text",
				props: { id: "t-1", text: "old", subtitle: "old-sub" },
			});
			getSelectorForId.mockReturnValue({ index: 0, zone: "default-zone" });

			renderHook(() => useCanvasDropController(document), { wrapper });
			dropText("Declared body");

			// The declared propPath received the drop; the heuristic's
			// pick (`text`) was left alone — it stays the fallback for
			// undeclared components only.
			expect(committedProps()["subtitle"]).toBe("Declared body");
			expect(committedProps()["text"]).toBe("old");
		} finally {
			components["Text"] = original;
		}
	});

	it("declared ImageTarget routes src AND alt over the heuristic", () => {
		const components = snapshot.config.components as Record<string, unknown>;
		const original = components["Text"];
		components["Text"] = {
			fields: { text: { type: "text" } },
			metadata: {
				anvilkit: {
					editor: {
						styleTargets: { root: { label: "Text", properties: [] } },
						images: [
							{ id: "cover", srcPropPath: "cover", altPropPath: "coverAlt" },
						],
					},
				},
			},
		};
		try {
			getItemById.mockReturnValue({
				type: "Text",
				props: { id: "t-1", text: "old", cover: "/a.png", coverAlt: "A" },
			});
			getSelectorForId.mockReturnValue({ index: 0, zone: "default-zone" });

			renderHook(() => useCanvasDropController(document), { wrapper });
			dropAt(
				{ kind: "image", url: "/declared.png", alt: "Declared alt" },
				5,
				5,
			);

			expect(committedProps()["cover"]).toBe("/declared.png");
			expect(committedProps()["coverAlt"]).toBe("Declared alt");
		} finally {
			components["Text"] = original;
		}
	});

	it("falls back to the candidate prop when the rendered text matches no prop", () => {
		appendText("p", rectAt(0, 0, 100, 100), "Rendered, not stored");
		getItemById.mockReturnValue({
			type: "Text",
			props: { id: "t-1", text: "stored value" },
		});
		getSelectorForId.mockReturnValue({ index: 0, zone: "default-zone" });

		renderHook(() => useCanvasDropController(document), { wrapper });
		dropAt({ kind: "text", body: "FALLBACK" }, 5, 5);

		const props = committedProps();
		expect(props["text"]).toBe("FALLBACK");
		expect(toastWarning).not.toHaveBeenCalled();
	});
});
