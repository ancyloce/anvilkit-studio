/**
 * @file CORE-P1B-005/-008 — canvas handles: capability/lock
 * eligibility, drag → ephemeral preview → single commit, Escape
 * restore, keyboard nudges (±1 / Shift ±10, one commit per press),
 * and the §13.6 live announcement carrying value + active layer.
 */

import type { EditorCapabilityMetadata } from "@anvilkit/contracts/editor";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import { buildLegacyPuckData } from "../../../testing/editor/index.js";
import { createStudioEditorBridge } from "../bridge.js";
import { createCanvasDomRegistry } from "../canvas/dom-registry.js";
import { CanvasHandles } from "../canvas/handles/CanvasHandles.js";
import { AuthoringOverlayRoot } from "../canvas/overlay-root.js";
import { createEditorCommandPort } from "../command-port.js";
import { createEditorSelectionController } from "../selection.js";

afterEach(cleanup);

const FULL_CAPS: EditorCapabilityMetadata = {
	version: "1",
	styleTarget: "root",
	capabilities: {
		layoutItem: true,
		layoutContainer: true,
		visualStyle: true,
	},
};

function setup(options?: {
	readonly metadata?: EditorCapabilityMetadata | undefined;
	readonly locked?: boolean;
	/** Inline display for the target (gap eligibility needs flex/grid). */
	readonly display?: string;
	/** Mocked content rect for a second registry node (`legacy-1`). */
	readonly sibling?: {
		readonly left: number;
		readonly top: number;
		readonly width: number;
		readonly height: number;
	};
}) {
	const bridge = createStudioEditorBridge();
	let data = buildLegacyPuckData();
	let recorded = 0;
	const port = createEditorCommandPort({
		getPuckApi: () =>
			({
				appState: {
					get data() {
						return data;
					},
				},
				dispatch: (action: { recordHistory?: boolean; data?: typeof data }) => {
					if (action.data !== undefined) {
						data = action.data;
					}
					if (action.recordHistory === true) {
						recorded += 1;
					}
				},
			}) as never,
		getData: () => data,
		editor: { features: { enabled: true } },
		onStateChange: () => bridge.notify(),
	});
	bridge.port = port;
	bridge.selection = createEditorSelectionController({
		syncPrimaryToPuck: () => undefined,
		onChange: () => bridge.notify(),
	});
	bridge.capabilities = {
		forComponent: () => options?.metadata ?? FULL_CAPS,
		forNode: () => options?.metadata ?? FULL_CAPS,
		listUsedFeatures: () => [],
	};

	const doc = document.implementation.createHTMLDocument();
	doc.body.innerHTML = `<div id="frame-root"><div data-ak-node="legacy-0">node</div>${
		options?.sibling === undefined
			? ""
			: '<div data-ak-node="legacy-1">sibling</div>'
	}</div>`;
	const target = doc.querySelector('[data-ak-node="legacy-0"]') as HTMLElement;
	target.getBoundingClientRect = () =>
		({ left: 10, top: 20, width: 200, height: 100 }) as DOMRect;
	if (options?.display !== undefined) {
		target.style.display = options.display;
	}
	const siblingRect = options?.sibling;
	if (siblingRect !== undefined) {
		const sibling = doc.querySelector(
			'[data-ak-node="legacy-1"]',
		) as HTMLElement;
		sibling.getBoundingClientRect = () => siblingRect as DOMRect;
	}
	const registry = createCanvasDomRegistry();
	registry.register(doc);
	bridge.canvasRegistry = registry;
	bridge.canvasDocument = doc;

	if (options?.locked === true) {
		void port.execute({
			id: "lock",
			expectedRevision: 0,
			source: "layers",
			timestamp: 1,
			type: "node.lock.set",
			nodeIds: ["legacy-0"],
			locked: true,
		});
	}

	render(
		<EditorI18nProvider>
			<AuthoringOverlayRoot bridge={bridge}>
				<CanvasHandles bridge={bridge} />
			</AuthoringOverlayRoot>
		</EditorI18nProvider>,
	);
	return {
		bridge,
		doc,
		target,
		port,
		recordedCount: () => recorded,
		getData: () => data,
		setData: (next: typeof data) => {
			data = next;
		},
	};
}

function pointer(
	type: string,
	init: { clientX: number; clientY: number },
): MouseEvent {
	return new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
}

describe("canvas handles (CORE-P1B-005)", () => {
	it("renders the eligible handle set for a fully-capable node", async () => {
		const { bridge, doc } = setup();
		act(() => bridge.selection?.select("legacy-0"));
		await waitFor(() => {
			const handles = [...doc.querySelectorAll("[data-ak-handle]")].map((el) =>
				el.getAttribute("data-ak-handle"),
			);
			expect(handles).toContain("resize-e");
			expect(handles).toContain("resize-s");
			expect(handles).toContain("padding-top");
			expect(handles).toContain("radius");
		});
	});

	it("hides handles for locked nodes and legacy components", async () => {
		const locked = setup({ locked: true });
		act(() => locked.bridge.selection?.select("legacy-0"));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(locked.doc.querySelectorAll("[data-ak-handle]")).toHaveLength(0);
		cleanup();

		const legacy = setup({ metadata: undefined });
		legacy.bridge.capabilities = {
			forComponent: () => undefined,
			forNode: () => undefined,
			listUsedFeatures: () => [],
		};
		act(() => legacy.bridge.selection?.select("legacy-0"));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(legacy.doc.querySelectorAll("[data-ak-handle]")).toHaveLength(0);
	});

	it("drags the width handle: preview paints, release commits ONE command", async () => {
		const { bridge, doc, target, port, recordedCount } = setup();
		act(() => bridge.selection?.select("legacy-0"));
		const handle = await waitFor(() => {
			const el = doc.querySelector('[data-ak-handle="resize-e"]');
			expect(el).not.toBeNull();
			return el as HTMLElement;
		});

		act(() => {
			handle.dispatchEvent(
				pointer("pointerdown", { clientX: 210, clientY: 70 }),
			);
			doc.dispatchEvent(pointer("pointermove", { clientX: 240, clientY: 70 }));
		});
		// Ephemeral preview painted on the element, not the sidecar.
		expect(target.style.width).toBe("230px");
		expect(port.getSnapshot().revision).toBe(0);

		act(() => {
			doc.dispatchEvent(pointer("pointerup", { clientX: 240, clientY: 70 }));
		});
		await waitFor(() => expect(port.getSnapshot().revision).toBe(1));
		expect(recordedCount()).toBe(1);
		// Preview cleared; the durable value lives in the sidecar.
		expect(target.style.width).toBe("");
		expect(
			port.getSnapshot().authoring.nodes["legacy-0"]?.layout?.base?.width,
		).toEqual({ kind: "unit", value: 230, unit: "px" });
	});

	it("Escape mid-drag restores the preview and commits nothing", async () => {
		const { bridge, doc, target, port } = setup();
		act(() => bridge.selection?.select("legacy-0"));
		const handle = await waitFor(
			() => doc.querySelector('[data-ak-handle="resize-e"]') as HTMLElement,
		);
		act(() => {
			handle.dispatchEvent(
				pointer("pointerdown", { clientX: 210, clientY: 70 }),
			);
			doc.dispatchEvent(pointer("pointermove", { clientX: 260, clientY: 70 }));
		});
		expect(target.style.width).toBe("250px");
		act(() => {
			doc.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
			);
		});
		expect(target.style.width).toBe("");
		expect(port.getSnapshot().revision).toBe(0);
	});
});

describe("keyboard equivalents + announcements (CORE-P1B-008)", () => {
	it("nudges ±1 / Shift ±10 with one commit per press and announces", async () => {
		const { bridge, doc, port } = setup();
		act(() => bridge.selection?.select("legacy-0"));
		const handle = await waitFor(
			() => doc.querySelector('[data-ak-handle="resize-e"]') as HTMLElement,
		);
		expect(handle.getAttribute("aria-label")).toContain("legacy-0");

		act(() => {
			handle.dispatchEvent(
				new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
			);
		});
		await waitFor(() =>
			expect(
				port.getSnapshot().authoring.nodes["legacy-0"]?.layout?.base?.width,
			).toEqual({ kind: "unit", value: 201, unit: "px" }),
		);

		act(() => {
			handle.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "ArrowRight",
					shiftKey: true,
					bubbles: true,
				}),
			);
		});
		await waitFor(() => expect(port.getSnapshot().revision).toBe(2));

		const announcer = doc.querySelector("[data-ak-handle-announcer]");
		expect(announcer?.getAttribute("aria-live")).toBe("polite");
		await waitFor(() => {
			expect(announcer?.textContent).toMatch(/210px/);
			expect(announcer?.textContent).toMatch(/Base/);
		});
	});

	it("keyboard-only edit → commit → undo restores the pre-edit value", async () => {
		const { bridge, doc, port, getData, setData } = setup();
		act(() => bridge.selection?.select("legacy-0"));
		const handle = await waitFor(
			() => doc.querySelector('[data-ak-handle="resize-e"]') as HTMLElement,
		);
		const before = getData();

		act(() => {
			handle.dispatchEvent(
				new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
			);
		});
		await waitFor(() =>
			expect(
				port.getSnapshot().authoring.nodes["legacy-0"]?.layout?.base?.width,
			).toEqual({ kind: "unit", value: 201, unit: "px" }),
		);

		// Simulated Puck undo: the pre-edit data comes back through the
		// foreign-change feed and the sidecar read reflects it exactly.
		act(() => {
			setData(before);
			(
				port as unknown as { handleDataChange: (data: typeof before) => void }
			).handleDataChange(before);
		});
		await waitFor(() =>
			expect(
				port.getSnapshot().authoring.nodes["legacy-0"]?.layout?.base?.width,
			).toBeUndefined(),
		);
	});
});

describe("per-handle command emission (CORE-P1B-005)", () => {
	it("renders all four padding edges and the corner handle", async () => {
		const { bridge, doc } = setup();
		act(() => bridge.selection?.select("legacy-0"));
		await waitFor(() => {
			const handles = [...doc.querySelectorAll("[data-ak-handle]")].map((el) =>
				el.getAttribute("data-ak-handle"),
			);
			for (const id of [
				"padding-top",
				"padding-right",
				"padding-bottom",
				"padding-left",
				"resize-se",
			]) {
				expect(handles).toContain(id);
			}
		});
	});

	it("shows the gap handle only for flex/grid containers", async () => {
		const block = setup();
		act(() => block.bridge.selection?.select("legacy-0"));
		await waitFor(() =>
			expect(
				block.doc.querySelector('[data-ak-handle="resize-e"]'),
			).not.toBeNull(),
		);
		expect(block.doc.querySelector('[data-ak-handle="gap"]')).toBeNull();
		cleanup();

		const flex = setup({ display: "flex" });
		act(() => flex.bridge.selection?.select("legacy-0"));
		await waitFor(() =>
			expect(flex.doc.querySelector('[data-ak-handle="gap"]')).not.toBeNull(),
		);
	});

	it("drags the gap handle into ONE gap command", async () => {
		const { bridge, doc, port, recordedCount } = setup({ display: "flex" });
		act(() => bridge.selection?.select("legacy-0"));
		const handle = await waitFor(
			() => doc.querySelector('[data-ak-handle="gap"]') as HTMLElement,
		);
		act(() => {
			handle.dispatchEvent(
				pointer("pointerdown", { clientX: 100, clientY: 30 }),
			);
			doc.dispatchEvent(pointer("pointermove", { clientX: 118, clientY: 30 }));
			doc.dispatchEvent(pointer("pointerup", { clientX: 118, clientY: 30 }));
		});
		await waitFor(() => expect(port.getSnapshot().revision).toBe(1));
		expect(recordedCount()).toBe(1);
		expect(
			port.getSnapshot().authoring.nodes["legacy-0"]?.layout?.base?.gap,
		).toEqual({ kind: "unit", value: 18, unit: "px" });
	});

	it("drags padding-bottom INWARD (up) to grow the padding", async () => {
		const { bridge, doc, port } = setup();
		act(() => bridge.selection?.select("legacy-0"));
		const handle = await waitFor(
			() =>
				doc.querySelector('[data-ak-handle="padding-bottom"]') as HTMLElement,
		);
		act(() => {
			handle.dispatchEvent(
				pointer("pointerdown", { clientX: 20, clientY: 110 }),
			);
			doc.dispatchEvent(pointer("pointermove", { clientX: 20, clientY: 96 }));
			doc.dispatchEvent(pointer("pointerup", { clientX: 20, clientY: 96 }));
		});
		await waitFor(() =>
			expect(
				port.getSnapshot().authoring.nodes["legacy-0"]?.layout?.base?.padding
					?.bottom,
			).toEqual({ kind: "unit", value: 14, unit: "px" }),
		);
	});

	it("drags the radius handle into ONE all-corner style command", async () => {
		const { bridge, doc, port, recordedCount } = setup();
		act(() => bridge.selection?.select("legacy-0"));
		const handle = await waitFor(
			() => doc.querySelector('[data-ak-handle="radius"]') as HTMLElement,
		);
		act(() => {
			handle.dispatchEvent(
				pointer("pointerdown", { clientX: 12, clientY: 22 }),
			);
			doc.dispatchEvent(pointer("pointermove", { clientX: 20, clientY: 22 }));
			doc.dispatchEvent(pointer("pointerup", { clientX: 20, clientY: 22 }));
		});
		await waitFor(() => expect(port.getSnapshot().revision).toBe(1));
		expect(recordedCount()).toBe(1);
		const radius =
			port.getSnapshot().authoring.nodes["legacy-0"]?.style?.base?.radius;
		expect(radius?.topLeft).toEqual({ kind: "unit", value: 8, unit: "px" });
		expect(radius?.bottomRight).toEqual({ kind: "unit", value: 8, unit: "px" });
	});

	it("corner resize writes width AND height in one command", async () => {
		const { bridge, doc, target, port, recordedCount } = setup();
		act(() => bridge.selection?.select("legacy-0"));
		const handle = await waitFor(
			() => doc.querySelector('[data-ak-handle="resize-se"]') as HTMLElement,
		);
		act(() => {
			handle.dispatchEvent(
				pointer("pointerdown", { clientX: 210, clientY: 120 }),
			);
			doc.dispatchEvent(pointer("pointermove", { clientX: 240, clientY: 140 }));
		});
		expect(target.style.width).toBe("230px");
		expect(target.style.height).toBe("120px");
		act(() => {
			doc.dispatchEvent(pointer("pointerup", { clientX: 240, clientY: 140 }));
		});
		await waitFor(() => expect(port.getSnapshot().revision).toBe(1));
		expect(recordedCount()).toBe(1);
		const layout = port.getSnapshot().authoring.nodes["legacy-0"]?.layout?.base;
		expect(layout?.width).toEqual({ kind: "unit", value: 230, unit: "px" });
		expect(layout?.height).toEqual({ kind: "unit", value: 120, unit: "px" });
	});
});

describe("snap during resize (CORE-P1B-006 integration)", () => {
	const sibling = { left: 245, top: 20, width: 60, height: 100 };

	it("snaps the moving edge to a sibling edge and shows the guide", async () => {
		const { bridge, doc, target, port } = setup({ sibling });
		act(() => bridge.selection?.select("legacy-0"));
		const handle = await waitFor(
			() => doc.querySelector('[data-ak-handle="resize-e"]') as HTMLElement,
		);
		act(() => {
			handle.dispatchEvent(
				pointer("pointerdown", { clientX: 210, clientY: 70 }),
			);
			// Raw width 230 → right edge 240; sibling edge at 245 is
			// inside the 6 px window → snapped width 235.
			doc.dispatchEvent(pointer("pointermove", { clientX: 240, clientY: 70 }));
		});
		expect(target.style.width).toBe("235px");
		await waitFor(() => {
			const guide = doc.querySelector('[data-ak-snap-guide="x"]');
			expect(guide).not.toBeNull();
			expect(guide?.getAttribute("data-ak-snap-kind")).toBe("sibling-edge");
		});
		expect(doc.querySelector("[data-ak-spacing-label]")).not.toBeNull();

		act(() => {
			doc.dispatchEvent(pointer("pointerup", { clientX: 240, clientY: 70 }));
		});
		await waitFor(() =>
			expect(
				port.getSnapshot().authoring.nodes["legacy-0"]?.layout?.base?.width,
			).toEqual({ kind: "unit", value: 235, unit: "px" }),
		);
		// Guides clear with the gesture.
		await waitFor(() =>
			expect(doc.querySelector("[data-ak-snap-guide]")).toBeNull(),
		);
	});

	it("Alt disables snapping (raw value commits, no guide)", async () => {
		const { bridge, doc, target, port } = setup({ sibling });
		act(() => bridge.selection?.select("legacy-0"));
		const handle = await waitFor(
			() => doc.querySelector('[data-ak-handle="resize-e"]') as HTMLElement,
		);
		act(() => {
			handle.dispatchEvent(
				pointer("pointerdown", { clientX: 210, clientY: 70 }),
			);
			doc.dispatchEvent(
				new MouseEvent("pointermove", {
					bubbles: true,
					cancelable: true,
					clientX: 240,
					clientY: 70,
					altKey: true,
				}),
			);
		});
		expect(target.style.width).toBe("230px");
		expect(doc.querySelector("[data-ak-snap-guide]")).toBeNull();
		act(() => {
			doc.dispatchEvent(pointer("pointerup", { clientX: 240, clientY: 70 }));
		});
		await waitFor(() =>
			expect(
				port.getSnapshot().authoring.nodes["legacy-0"]?.layout?.base?.width,
			).toEqual({ kind: "unit", value: 230, unit: "px" }),
		);
	});
});
