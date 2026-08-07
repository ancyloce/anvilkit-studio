"use client";

/**
 * @file The canvas gesture controller (PLAN-0020 CORE-P1B-004;
 * ED-CANVAS-004; DD-0019 §10.4, §13.4; DD-DEC-005).
 *
 * One state machine for every drag gesture:
 * `idle → armed (pointerdown) → dragging (≥3 px) → idle` via commit
 * (pointerup), or cancel (Escape / pointercancel / blur / document
 * replacement / external revision).
 *
 * Invariants:
 * - **Ephemeral preview**: pointermove produces a preview the caller
 *   paints straight onto DOM elements — never durable React state,
 *   never the sidecar; cancel simply clears it.
 * - **Single intent**: pointerup converts the total delta into exactly
 *   ONE command through the port (§10.5); an armed-but-never-dragged
 *   press commits nothing (it was a click).
 * - **External revision** observed mid-gesture cancels the gesture
 *   with a caller-visible notification — the preview is stale against
 *   a document that changed underneath it.
 */

import type {
	EditorCommand,
} from "../../../editor/legacy/index.js";
import type { InternalEditorCommandPort } from "../command-port.js";
import type { CanvasPoint } from "./geometry.js";

/** Movement (client px) required to arm → drag (§13.4). */
export const DRAG_THRESHOLD_PX = 3;

/** Gesture lifecycle phase. */
export type GesturePhase = "idle" | "armed" | "dragging";

/** Why an active gesture ended without committing. */
export type GestureCancelReason =
	| "escape"
	| "pointercancel"
	| "blur"
	| "document-replaced"
	| "external-revision";

/**
 * One gesture's behavior. `preview` paints the ephemeral state for a
 * delta; `commit` converts the final delta into the single command
 * (or `null` for a no-op drag).
 */
export interface GestureSpec {
	/** Content-free gesture id for `gesture.completed` events. */
	readonly gesture: string;
	readonly preview: (delta: CanvasPoint) => void;
	readonly clearPreview: () => void;
	readonly commit: (delta: CanvasPoint) => EditorCommand | null;
}

/** Controller dependencies. */
export interface GestureControllerDeps {
	readonly port: InternalEditorCommandPort;
	/** Emit the content-free `gesture.completed` event. */
	readonly onCompleted?: (gesture: string, durationMs: number) => void;
	/** Surface a cancellation to the user (external revision etc.). */
	readonly onCancelled?: (gesture: string, reason: GestureCancelReason) => void;
}

/** The gesture controller surface. */
export interface GestureController {
	/** Pointerdown over a handle: arm a gesture at a client point. */
	arm(spec: GestureSpec, startClient: CanvasPoint): void;
	/** Pointermove: threshold-arm and paint previews while dragging. */
	move(client: CanvasPoint): void;
	/** Pointerup: commit the total delta as one command. */
	finish(): void;
	/** Abort without committing; restores by clearing the preview. */
	cancel(reason: GestureCancelReason): void;
	/** A foreign commit landed — cancels any active gesture. */
	handleExternalRevision(): void;
	phase(): GesturePhase;
}

/** Create a per-`<Studio>` gesture controller. */
export function createGestureController(
	deps: GestureControllerDeps,
): GestureController {
	let phase: GesturePhase = "idle";
	let spec: GestureSpec | null = null;
	let start: CanvasPoint = { x: 0, y: 0 };
	let last: CanvasPoint = { x: 0, y: 0 };
	let startedAt = 0;
	let armedRevision = 0;

	const reset = (): void => {
		phase = "idle";
		spec = null;
	};

	const controller: GestureController = {
		arm(nextSpec, startClient) {
			if (phase !== "idle") {
				// A second pointerdown mid-gesture aborts the first cleanly.
				controller.cancel("pointercancel");
			}
			phase = "armed";
			spec = nextSpec;
			start = startClient;
			last = startClient;
			startedAt = performance.now();
			armedRevision = deps.port.getSnapshot().revision;
		},

		move(client) {
			if (spec === null || phase === "idle") {
				return;
			}
			if (deps.port.getSnapshot().revision !== armedRevision) {
				controller.cancel("external-revision");
				return;
			}
			last = client;
			const delta = { x: client.x - start.x, y: client.y - start.y };
			if (phase === "armed") {
				if (
					Math.abs(delta.x) < DRAG_THRESHOLD_PX &&
					Math.abs(delta.y) < DRAG_THRESHOLD_PX
				) {
					return;
				}
				phase = "dragging";
			}
			spec.preview(delta);
		},

		finish() {
			if (spec === null) {
				reset();
				return;
			}
			const active = spec;
			const wasDragging = phase === "dragging";
			const delta = { x: last.x - start.x, y: last.y - start.y };
			active.clearPreview();
			reset();
			if (!wasDragging) {
				return; // a plain click: no command, no history entry
			}
			if (deps.port.getSnapshot().revision !== armedRevision) {
				deps.onCancelled?.(active.gesture, "external-revision");
				return;
			}
			const command = active.commit(delta);
			if (command !== null) {
				void deps.port.execute(command);
			}
			deps.onCompleted?.(active.gesture, performance.now() - startedAt);
		},

		cancel(reason) {
			if (spec === null) {
				reset();
				return;
			}
			const active = spec;
			active.clearPreview();
			reset();
			deps.onCancelled?.(active.gesture, reason);
		},

		handleExternalRevision() {
			if (phase !== "idle") {
				controller.cancel("external-revision");
			}
		},

		phase: () => phase,
	};
	return controller;
}
