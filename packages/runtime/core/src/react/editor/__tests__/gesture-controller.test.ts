/**
 * @file CORE-P1B-004 — gesture controller: idle→armed(3 px)→dragging
 * lifecycle, click-without-drag commits nothing, one command per
 * isolated gesture (single-intent), Escape/pointercancel restore via
 * preview clearing, and external-revision cancellation with
 * notification.
 */

import { describe, expect, it, vi } from "vitest";
import { buildLegacyPuckData } from "../../../testing/editor/index.js";
import {
	createGestureController,
	type GestureSpec,
} from "../canvas/gesture-controller.js";
import {
	createEditorCommandPort,
	type InternalEditorCommandPort,
} from "../command-port.js";

function portWithHistory(): {
	port: InternalEditorCommandPort;
	recordingCount: () => number;
} {
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
	});
	return { port, recordingCount: () => recorded };
}

function spec(port: InternalEditorCommandPort): {
	spec: GestureSpec;
	preview: ReturnType<typeof vi.fn>;
	clearPreview: ReturnType<typeof vi.fn>;
} {
	const preview = vi.fn();
	const clearPreview = vi.fn();
	return {
		preview,
		clearPreview,
		spec: {
			gesture: "resize-width",
			preview,
			clearPreview,
			commit: (delta) => ({
				id: "g-1",
				expectedRevision: port.getSnapshot().revision,
				source: "canvas",
				timestamp: 1,
				type: "node.layout.set",
				nodeIds: ["legacy-0"],
				breakpointId: "base",
				patch: {
					width: { kind: "unit", value: 100 + delta.x, unit: "px" },
				},
			}),
		},
	};
}

describe("gesture controller (CORE-P1B-004)", () => {
	it("stays armed under the 3 px threshold and commits nothing on release", () => {
		const { port, recordingCount } = portWithHistory();
		const controller = createGestureController({ port });
		const s = spec(port);
		controller.arm(s.spec, { x: 100, y: 100 });
		expect(controller.phase()).toBe("armed");
		controller.move({ x: 102, y: 101 });
		expect(controller.phase()).toBe("armed");
		expect(s.preview).not.toHaveBeenCalled();
		controller.finish();
		expect(controller.phase()).toBe("idle");
		expect(recordingCount()).toBe(0);
	});

	it("paints ephemeral previews while dragging and commits ONE command", async () => {
		const { port, recordingCount } = portWithHistory();
		const completed = vi.fn();
		const controller = createGestureController({
			port,
			onCompleted: completed,
		});
		const s = spec(port);
		controller.arm(s.spec, { x: 100, y: 100 });
		controller.move({ x: 110, y: 100 });
		controller.move({ x: 130, y: 100 });
		expect(controller.phase()).toBe("dragging");
		expect(s.preview).toHaveBeenCalledTimes(2);
		expect(s.preview).toHaveBeenLastCalledWith({ x: 30, y: 0 });

		controller.finish();
		await Promise.resolve();
		expect(recordingCount()).toBe(1);
		expect(s.clearPreview).toHaveBeenCalledTimes(1);
		expect(completed).toHaveBeenCalledWith("resize-width", expect.any(Number));
		const width =
			port.getSnapshot().authoring.nodes["legacy-0"]?.layout?.base?.width;
		expect(width).toEqual({ kind: "unit", value: 130, unit: "px" });
	});

	it("cancel clears the preview, commits nothing, and notifies", () => {
		const { port, recordingCount } = portWithHistory();
		const cancelled = vi.fn();
		const controller = createGestureController({
			port,
			onCancelled: cancelled,
		});
		const s = spec(port);
		controller.arm(s.spec, { x: 0, y: 0 });
		controller.move({ x: 20, y: 0 });
		controller.cancel("escape");
		expect(controller.phase()).toBe("idle");
		expect(s.clearPreview).toHaveBeenCalledTimes(1);
		expect(recordingCount()).toBe(0);
		expect(cancelled).toHaveBeenCalledWith("resize-width", "escape");
	});

	it("cancels on an external revision observed mid-gesture", async () => {
		const { port, recordingCount } = portWithHistory();
		const cancelled = vi.fn();
		const controller = createGestureController({
			port,
			onCancelled: cancelled,
		});
		const s = spec(port);
		controller.arm(s.spec, { x: 0, y: 0 });
		controller.move({ x: 20, y: 0 });

		// A foreign commit bumps the revision under the gesture.
		await port.execute({
			id: "foreign",
			expectedRevision: 0,
			source: "plugin",
			timestamp: 1,
			type: "node.rename",
			nodeId: "legacy-1",
			name: "Other",
		});
		controller.move({ x: 40, y: 0 });
		expect(controller.phase()).toBe("idle");
		expect(cancelled).toHaveBeenCalledWith("resize-width", "external-revision");
		// Only the foreign commit recorded — the gesture never committed.
		expect(recordingCount()).toBe(1);
	});

	it("a second arm mid-gesture aborts the first cleanly", () => {
		const { port } = portWithHistory();
		const cancelled = vi.fn();
		const controller = createGestureController({
			port,
			onCancelled: cancelled,
		});
		const first = spec(port);
		const second = spec(port);
		controller.arm(first.spec, { x: 0, y: 0 });
		controller.move({ x: 10, y: 0 });
		controller.arm(second.spec, { x: 50, y: 50 });
		expect(first.clearPreview).toHaveBeenCalledTimes(1);
		expect(controller.phase()).toBe("armed");
	});
});
