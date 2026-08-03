/**
 * @file CORE-P1B-013 — the canvas multi-select toolbar: visibility
 * rules (≥2 nodes, writable, no inline session), §13.6 align through
 * ONE parent-layout command for flow siblings, distribute gating at
 * three nodes, and the §18 bulk ops reused verbatim (delete through
 * the one-dispatch `commitNative` path).
 */

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import type { StudioPluginContext } from "@/types/plugin";
import { buildLegacyPuckData } from "../../../testing/editor/index.js";
import { createStudioEditorBridge } from "../bridge.js";
import { createCanvasDomRegistry } from "../canvas/dom-registry.js";
import { AuthoringOverlayRoot } from "../canvas/overlay-root.js";
import { SelectionToolbar } from "../canvas/SelectionToolbar.js";
import { createEditorCommandPort } from "../command-port.js";
import { createEditorSelectionController } from "../selection.js";
import {
	applyPuckDataAction,
	type PuckDataAction,
} from "./puck-store-double.js";

afterEach(cleanup);

function setup() {
	const bridge = createStudioEditorBridge();
	let data = buildLegacyPuckData();
	let recorded = 0;
	const puckApi = {
		appState: {
			get data() {
				return data;
			},
		},
		config: { components: {} },
		dispatch: (action: PuckDataAction) => {
			data = applyPuckDataAction(data, action);
			if (action.recordHistory === true) {
				recorded += 1;
			}
		},
		getParentById: () => null,
	};
	const port = createEditorCommandPort({
		getPuckApi: () => puckApi as never,
		getData: () => data,
		editor: { features: { enabled: true } },
		onStateChange: () => bridge.notify(),
	});
	bridge.port = port;
	bridge.selection = createEditorSelectionController({
		syncPrimaryToPuck: () => undefined,
		onChange: () => bridge.notify(),
	});

	const doc = document.implementation.createHTMLDocument();
	doc.body.innerHTML = `
		<div id="frame-root">
			<div data-ak-node="legacy-0" style="display:flex">
				<div data-ak-node="legacy-1">a</div>
				<div data-ak-node="legacy-2">b</div>
			</div>
		</div>`;
	const rects: Record<
		string,
		{ left: number; top: number; width: number; height: number }
	> = {
		"legacy-0": { left: 0, top: 0, width: 400, height: 100 },
		"legacy-1": { left: 0, top: 0, width: 100, height: 50 },
		"legacy-2": { left: 150, top: 10, width: 100, height: 50 },
	};
	for (const [id, rect] of Object.entries(rects)) {
		const el = doc.querySelector(`[data-ak-node="${id}"]`) as HTMLElement;
		el.getBoundingClientRect = () => rect as DOMRect;
	}
	const registry = createCanvasDomRegistry();
	registry.register(doc);
	bridge.canvasRegistry = registry;
	bridge.canvasDocument = doc;

	const ctx = {
		getData: () => data,
		getPuckApi: () => puckApi,
	} as unknown as StudioPluginContext;

	render(
		<EditorI18nProvider>
			<StudioPluginContextProvider value={ctx}>
				<AuthoringOverlayRoot bridge={bridge}>
					<SelectionToolbar bridge={bridge} />
				</AuthoringOverlayRoot>
			</StudioPluginContextProvider>
		</EditorI18nProvider>,
	);
	return { bridge, doc, port, recordedCount: () => recorded };
}

describe("canvas selection toolbar (CORE-P1B-013)", () => {
	it("appears only for a multi-selection", async () => {
		const { bridge, doc } = setup();
		expect(doc.querySelector("[data-ak-selection-toolbar]")).toBeNull();
		act(() => bridge.selection?.select("legacy-1"));
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(doc.querySelector("[data-ak-selection-toolbar]")).toBeNull();
		act(() => bridge.selection?.selectMany(["legacy-1", "legacy-2"]));
		await waitFor(() =>
			expect(doc.querySelector("[data-ak-selection-toolbar]")).not.toBeNull(),
		);
	});

	it("aligns flow siblings via ONE parent-layout command (§13.6)", async () => {
		const { bridge, doc, port, recordedCount } = setup();
		act(() => bridge.selection?.selectMany(["legacy-1", "legacy-2"]));
		const button = await waitFor(() => {
			const el = doc.querySelector('[data-ak-toolbar-action="top"]');
			expect(el).not.toBeNull();
			return el as HTMLElement;
		});
		act(() => {
			button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		await waitFor(() => expect(port.getSnapshot().revision).toBe(1));
		expect(recordedCount()).toBe(1);
		// Cross-axis align for a row container → alignItems on the PARENT.
		expect(
			port.getSnapshot().authoring.nodes["legacy-0"]?.layout?.base?.alignItems,
		).toBe("start");
		// The children themselves were not touched.
		expect(
			port.getSnapshot().authoring.nodes["legacy-1"]?.layout,
		).toBeUndefined();
	});

	it("gates distribute below three nodes", async () => {
		const { bridge, doc } = setup();
		act(() => bridge.selection?.selectMany(["legacy-1", "legacy-2"]));
		const distribute = await waitFor(() => {
			const el = doc.querySelector('[data-ak-toolbar-action="distribute-x"]');
			expect(el).not.toBeNull();
			return el as HTMLButtonElement;
		});
		expect(distribute.disabled).toBe(true);
	});

	it("runs the §18 bulk delete through one commitNative dispatch", async () => {
		const { bridge, doc, port, recordedCount } = setup();
		act(() => bridge.selection?.selectMany(["legacy-1", "legacy-2"]));
		const button = await waitFor(() => {
			const el = doc.querySelector('[data-ak-toolbar-action="delete"]');
			expect(el).not.toBeNull();
			return el as HTMLElement;
		});
		act(() => {
			button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		await waitFor(() => expect(port.getSnapshot().revision).toBe(1));
		expect(recordedCount()).toBe(1);
		expect(bridge.selection?.getState().selectedIds).toEqual([]);
	});

	it("runs the §18 bulk duplicate through one commitNative dispatch", async () => {
		const { bridge, doc, port, recordedCount } = setup();
		act(() => bridge.selection?.selectMany(["legacy-1", "legacy-2"]));
		const button = await waitFor(() => {
			const el = doc.querySelector('[data-ak-toolbar-action="duplicate"]');
			expect(el).not.toBeNull();
			return el as HTMLElement;
		});
		act(() => {
			button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		// The duplicate path is async (dynamic imports) before its single
		// `commitNative` dispatch.
		await waitFor(() => expect(port.getSnapshot().revision).toBe(1), {
			timeout: 3000,
		});
		expect(recordedCount()).toBe(1);
	});

	it("files a naming request instead of capturing with a hardcoded name (CORE-P2-009H)", async () => {
		// The toolbar renders INSIDE the canvas iframe, where a modal
		// cannot live, so it validates and then hands off to
		// `CreateComponentDialog` in the main document. The capture used
		// to commit immediately with the literal name "Component";
		// asserting no commit here is what keeps that from coming back.
		const { bridge, doc, port, recordedCount } = setup();
		act(() => bridge.selection?.selectMany(["legacy-1", "legacy-2"]));
		const button = await waitFor(() => {
			const el = doc.querySelector(
				'[data-ak-toolbar-action="create-component"]',
			);
			expect(el).not.toBeNull();
			return el as HTMLElement;
		});
		act(() => {
			button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		// Async (dynamic engine import) before the request is filed.
		await waitFor(
			() =>
				expect(bridge.componentCapture.pending()).toEqual([
					"legacy-1",
					"legacy-2",
				]),
			{ timeout: 3000 },
		);
		// Nothing committed and nothing named yet.
		expect(port.getSnapshot().revision).toBe(0);
		expect(recordedCount()).toBe(0);
		expect(
			Object.keys(port.getSnapshot().authoring.componentDefinitions),
		).toHaveLength(0);
	});

	it("hides while an inline session is active", async () => {
		const { bridge, doc } = setup();
		bridge.inline = {
			getSession: () => ({
				nodeId: "legacy-1",
				target: { id: "t", propPath: "p", format: "plain" },
			}),
			subscribe: () => () => undefined,
			commit: () => undefined,
			cancel: () => undefined,
			tryEnterFromEvent: () => false,
			commitValue: () => undefined,
			handleExternalInterrupt: () => undefined,
		};
		act(() => bridge.selection?.selectMany(["legacy-1", "legacy-2"]));
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(doc.querySelector("[data-ak-selection-toolbar]")).toBeNull();
	});
});
