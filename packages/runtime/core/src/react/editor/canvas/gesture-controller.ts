"use client";

/**
 * @file The canvas gesture controller (PLAN-0028 `p4-006`; originally
 * PLAN-0020 CORE-P1B-004).
 *
 * One state machine for every drag gesture:
 * `idle → armed (pointerdown) → dragging (≥3 px) → idle` via commit
 * (pointerup), or cancel (Escape / pointercancel / blur / document
 * replacement / a foreign document change).
 *
 * Invariants:
 * - **Ephemeral preview**: pointermove produces a preview the caller
 *   paints straight onto DOM elements — never durable React state,
 *   never a document write; cancel simply clears it.
 * - **Drag coalescing**: N pointermoves produce ZERO writes. Pointerup
 *   converts the total delta into exactly one commit-helper call, so a
 *   resize gesture is ONE history entry and one undo restores the
 *   pre-drag size. An armed-but-never-dragged press commits nothing (it
 *   was a click).
 * - **A foreign document change** observed mid-gesture cancels the
 *   gesture with a caller-visible notification — the preview is stale
 *   against a document that moved underneath it.
 *
 * The controller no longer knows what a command is. `GestureSpec.commit`
 * calls a commit helper (`canvas/appearance.ts`) and reports whether it
 * wrote anything; the controller only owns *when* that happens and
 * guarantees it happens at most once per gesture.
 */

import type { CanvasPoint } from "./geometry.js";

/** Movement (client px) required to arm → drag. */
export const DRAG_THRESHOLD_PX = 3;

/** Gesture lifecycle phase. */
export type GesturePhase = "idle" | "armed" | "dragging";

/** Why an active gesture ended without committing. */
export type GestureCancelReason =
	| "escape"
	| "pointercancel"
	| "blur"
	| "document-replaced"
	| "external-change";

/**
 * One gesture's behavior. `preview` paints the ephemeral state for a
 * delta; `commit` turns the final delta into ONE commit-helper call and
 * returns `true` when the document actually changed.
 */
export interface GestureSpec {
	/** Content-free gesture id for `gesture.completed` events. */
	readonly gesture: string;
	readonly preview: (delta: CanvasPoint) => void;
	readonly clearPreview: () => void;
	readonly commit: (delta: CanvasPoint) => boolean;
}

/** Controller dependencies. */
export interface GestureControllerDeps {
	/**
	 * Identity token for the live document, compared with `Object.is`.
	 *
	 * Puck `Data` is replaced (never mutated) by every dispatch, so its
	 * reference IS the change signal — the canonical replacement for the
	 * sidecar revision counter this used to read. A token change between
	 * arm and release means someone else wrote while the pointer was
	 * down, and the previewed delta no longer describes a document that
	 * exists.
	 */
	readonly getDocumentToken: () => unknown;
	/** Emit the content-free `gesture.completed` event. */
	readonly onCompleted?: (gesture: string, durationMs: number) => void;
	/** Surface a cancellation to the user (foreign change etc.). */
	readonly onCancelled?: (gesture: string, reason: GestureCancelReason) => void;
}

/** The gesture controller surface. */
export interface GestureController {
	/** Pointerdown over a handle: arm a gesture at a client point. */
	arm(spec: GestureSpec, startClient: CanvasPoint): void;
	/** Pointermove: threshold-arm and paint previews while dragging. */
	move(client: CanvasPoint): void;
	/** Pointerup: commit the total delta as one intent. */
	finish(): void;
	/** Abort without committing; restores by clearing the preview. */
	cancel(reason: GestureCancelReason): void;
	/** A foreign write landed — cancels any active gesture. */
	handleExternalChange(): void;
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
	let armedToken: unknown;

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
			armedToken = deps.getDocumentToken();
		},

		move(client) {
			if (spec === null || phase === "idle") {
				return;
			}
			if (!Object.is(deps.getDocumentToken(), armedToken)) {
				controller.cancel("external-change");
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
				return; // a plain click: no write, no history entry
			}
			if (!Object.is(deps.getDocumentToken(), armedToken)) {
				deps.onCancelled?.(active.gesture, "external-change");
				return;
			}
			// The ONE write of the whole gesture.
			active.commit(delta);
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

		handleExternalChange() {
			if (phase !== "idle") {
				controller.cancel("external-change");
			}
		},

		phase: () => phase,
	};
	return controller;
}
