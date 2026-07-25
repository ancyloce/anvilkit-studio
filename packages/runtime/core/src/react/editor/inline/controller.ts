"use client";

/**
 * @file `InlineEditController` (PLAN-0020 CORE-P1B-009B, with the
 * plain-text surface 009C, IME guards 009F, paste sanitation 009G,
 * and the commit/cancel/undo integration 009H; ED-TEXT-001/003;
 * §13.2 — snapshot-gated public element).
 *
 * Session rules:
 * - exactly ONE active session (§17); a second `enter` exits the
 *   first via commit;
 * - the draft lives in the DOM surface only — never a durable store;
 *   interrupted sessions (Escape, external revision, document
 *   replacement) restore the pre-edit DOM exactly and commit nothing;
 * - canvas gestures, marquee, and drill-in are suppressed while a
 *   session is active (surfaces consult {@link getSession});
 * - **commit** fires at 750 ms typing idle or on blur — ONE
 *   history-recording dispatch per committed edit through the port's
 *   native-mutation path (`commitNative` prop write); a value-equal
 *   draft commits nothing;
 * - **IME**: commits and idle timers are fenced during composition —
 *   nothing converts drafts to commands between `compositionstart`
 *   and `compositionend`;
 * - **paste** (plain surface): text/plain extraction only (markup can
 *   never smuggle through `textContent`); payloads over 1 MiB are
 *   blocked with a visible diagnostic;
 * - browser-undo works freely IN-SESSION (native contenteditable
 *   history); once committed, undo is Puck history only.
 */

import type { InlineTextTarget } from "@anvilkit/contracts/editor";
import type { StudioEditorBridge } from "../bridge.js";
import type { InternalEditorCommandPort } from "../command-port.js";
import { setNodeProp } from "../native-tree.js";
import type {
	InlineEditSession,
	InternalInlineEditController,
} from "./controller-types.js";
import { targetFromElement } from "./targets.js";

export type {
	InlineEditController,
	InlineEditSession,
	InternalInlineEditController,
} from "./controller-types.js";

/** Commit-at-idle window (§17). */
export const INLINE_IDLE_COMMIT_MS = 750;
/** Paste hard cap (§17). */
export const INLINE_PASTE_LIMIT_BYTES = 1024 * 1024;

/** Plain-target normalization (§17): newline + whitespace cleanup. */
export function normalizePlainText(raw: string): string {
	return raw
		.replace(/ /g, " ")
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map((line) => line.replace(/[ \t]+$/g, ""))
		.join("\n")
		.replace(/\n+$/g, "");
}

function pathOf(target: InlineTextTarget): readonly (string | number)[] {
	return target.propPath
		.split(".")
		.map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

/** Create the per-`<Studio>` inline edit controller. */
export function createInlineEditController(
	bridge: StudioEditorBridge,
): InternalInlineEditController {
	const listeners = new Set<() => void>();
	let session: InlineEditSession | null = null;
	let sessionRevision = 0;
	let composing = false;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	let element: HTMLElement | null = null;
	let originalText = "";
	let originalEditable = "";
	let detachSurface: (() => void) | null = null;
	let pendingBlurCommit = false;
	let committing = false;

	const notify = (): void => {
		for (const listener of listeners) {
			listener();
		}
		bridge.notify();
	};

	const port = (): InternalEditorCommandPort | null =>
		bridge.port as InternalEditorCommandPort | null;

	const clearIdle = (): void => {
		if (idleTimer !== null) {
			clearTimeout(idleTimer);
			idleTimer = null;
		}
	};

	const scheduleIdleCommit = (): void => {
		clearIdle();
		if (composing) {
			return; // never convert drafts during composition (009F)
		}
		idleTimer = setTimeout(() => {
			controller.commit();
		}, INLINE_IDLE_COMMIT_MS);
	};

	const teardown = (): void => {
		clearIdle();
		detachSurface?.();
		detachSurface = null;
		if (element !== null) {
			element.contentEditable = originalEditable;
		}
		element = null;
		session = null;
		composing = false;
		pendingBlurCommit = false;
		bridge.diagnostics.setDiagnostics("inline-paste", []);
		notify();
	};

	const writeProp = (value: unknown): void => {
		const active = session;
		const activePort = port();
		if (active === null || activePort === null) {
			return;
		}
		committing = true;
		try {
			activePort.commitNative((data, authoring) => {
				const next = setNodeProp(
					data,
					active.nodeId,
					pathOf(active.target),
					value,
				);
				return next === null ? null : { data: next, authoring };
			});
		} finally {
			committing = false;
		}
	};

	const bindPlainSurface = (host: HTMLElement): void => {
		element = host;
		originalText = host.textContent ?? "";
		originalEditable = host.contentEditable;
		host.contentEditable = "true";
		try {
			host.focus();
		} catch {
			// Non-focusable in this environment: editing still works.
		}

		const onInput = (): void => {
			scheduleIdleCommit();
		};
		const onKeyDown = (event: KeyboardEvent): void => {
			event.stopPropagation(); // suppress editor shortcuts while typing
			if (event.key === "Escape") {
				event.preventDefault();
				controller.cancel();
			}
		};
		const onBlur = (): void => {
			if (composing) {
				pendingBlurCommit = true;
				return;
			}
			controller.commit();
		};
		const onCompositionStart = (): void => {
			composing = true;
			clearIdle();
		};
		const onCompositionEnd = (): void => {
			composing = false;
			if (pendingBlurCommit) {
				pendingBlurCommit = false;
				controller.commit();
				return;
			}
			scheduleIdleCommit();
		};
		const onPaste = (event: Event): void => {
			const clipboard = (event as ClipboardEvent).clipboardData;
			if (clipboard === null || clipboard === undefined) {
				return;
			}
			event.preventDefault(); // never let HTML through (009G)
			const text = clipboard.getData("text/plain");
			if (text.length > INLINE_PASTE_LIMIT_BYTES) {
				bridge.diagnostics.setDiagnostics("inline-paste", [
					{
						code: "EDITOR_LIMIT_EXCEEDED",
						severity: "warning",
						message: "pasted content exceeds the 1 MiB inline limit",
						recoverable: true,
						details: {
							limitKey: "inlinePasteBytes",
							limit: INLINE_PASTE_LIMIT_BYTES,
							actual: text.length,
						},
					},
				]);
				return;
			}
			const doc = host.ownerDocument;
			const inserted = ((): boolean => {
				try {
					return doc.execCommand("insertText", false, text);
				} catch {
					return false;
				}
			})();
			if (!inserted) {
				host.textContent = `${host.textContent ?? ""}${text}`;
			}
			scheduleIdleCommit();
		};

		host.addEventListener("input", onInput);
		host.addEventListener("keydown", onKeyDown);
		host.addEventListener("blur", onBlur);
		host.addEventListener("compositionstart", onCompositionStart);
		host.addEventListener("compositionend", onCompositionEnd);
		host.addEventListener("paste", onPaste);
		detachSurface = () => {
			host.removeEventListener("input", onInput);
			host.removeEventListener("keydown", onKeyDown);
			host.removeEventListener("blur", onBlur);
			host.removeEventListener("compositionstart", onCompositionStart);
			host.removeEventListener("compositionend", onCompositionEnd);
			host.removeEventListener("paste", onPaste);
		};
	};

	const controller: InternalInlineEditController = {
		getSession: () => session,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},

		tryEnterFromEvent(target) {
			const activePort = port();
			const registry = bridge.canvasRegistry;
			if (
				activePort === null ||
				registry === null ||
				registry === undefined ||
				activePort.isReadOnly() ||
				activePort.writersDisabled()
			) {
				return false;
			}
			const nodeId = registry.getNodeId(target);
			if (nodeId === null) {
				return false;
			}
			const metadata = bridge.capabilities?.forNode(nodeId);
			const resolved = targetFromElement(target, nodeId, metadata, registry);
			if (resolved === null) {
				return false;
			}
			// Locked nodes are selectable-not-mutable.
			if (activePort.getSnapshot().authoring.nodes[nodeId]?.locked === true) {
				return false;
			}
			if (session !== null) {
				controller.commit(); // single active session (009B)
			}
			session = { nodeId, target: resolved.target };
			sessionRevision = activePort.getSnapshot().revision;
			if (resolved.target.format === "plain") {
				bindPlainSurface(resolved.element);
			}
			// `tiptap` targets: the rich overlay (009E) observes the
			// session and mounts the shared-schema editor.
			notify();
			return true;
		},

		commit() {
			const active = session;
			if (active === null) {
				return;
			}
			if (composing) {
				pendingBlurCommit = true;
				return; // 009F: never commit mid-composition
			}
			if (active.target.format === "plain" && element !== null) {
				const draft = normalizePlainText(element.textContent ?? "");
				// Value-equal drafts commit nothing (no history entry).
				if (draft !== normalizePlainText(originalText)) {
					writeProp(draft);
				}
			}
			teardown();
		},

		commitValue(value) {
			if (session === null) {
				return;
			}
			writeProp(value);
			teardown();
		},

		cancel() {
			if (session === null) {
				return;
			}
			if (element !== null) {
				// Restore the pre-edit surface exactly (009H AC).
				element.textContent = originalText;
			}
			teardown();
		},

		handleExternalInterrupt() {
			// Our own in-flight commit bumps the revision too — never
			// treat it as foreign.
			if (session === null || committing) {
				return;
			}
			const activePort = port();
			if (
				activePort !== null &&
				activePort.getSnapshot().revision !== sessionRevision
			) {
				controller.cancel();
			}
		},
	};
	// Self-armed interrupt: ANY bridge notification (foreign commits,
	// undo/redo invalidations) re-checks the session's revision — no
	// external wiring required.
	bridge.subscribe(() => controller.handleExternalInterrupt());
	return controller;
}
