"use client";

/**
 * @file The **inline-editor-has-focus** signal (PLAN-0028 `p4-007`
 * deliverable 5) — the one seam that tells editor chrome an inline text
 * surface currently owns keyboard input, so bindings that collide with
 * text entry must stand down.
 *
 * ### Why a signal at all
 *
 * The inline surfaces are mounted **inside the canvas iframe**. A
 * `keydown` there never reaches a listener on the host document, so the
 * surface's own `stopPropagation` cannot suppress a host-document
 * keymap, and a keymap that also binds the canvas document cannot see
 * `event.target` well enough to distinguish "typing in the canvas" from
 * "a key pressed over the canvas". Focus is therefore *asked for*, not
 * inferred.
 *
 * ### Why session presence is the honest answer
 *
 * The controller enforces exactly one live session; every surface takes
 * focus when the session opens (`host.focus()` for `plain`,
 * `autofocus` for `tiptap`) and every surface ends the session on blur
 * (committing or, on Escape, cancelling). A live session therefore *is*
 * a focused text surface. The one degenerate case — a host element that
 * refuses focus — errs toward `true`, which suppresses a shortcut that
 * might have been safe rather than firing one that would eat a
 * keystroke; that is the correct direction for a text-entry guard.
 *
 * ### Deliberately dependency-light
 *
 * Reads the bridge only. It pulls in neither the controller
 * implementation nor Tiptap, so a keymap module can import it without
 * dragging the rich-text bundle onto its own path.
 */

import { useCallback, useSyncExternalStore } from "react";
import type { StudioEditorBridge } from "../bridge.js";

/**
 * True while an inline text editor holds keyboard focus.
 *
 * The imperative form, for `keydown` handlers and other non-render
 * call sites: read it at event time, and return early from any binding
 * that would otherwise consume a printable key, Escape, Enter, Backspace
 * or Delete.
 *
 * Null-tolerant on purpose — the bridge slot is `null` until the lazy
 * editor chunk installs the controller, and "no editor" is trivially
 * "not editing".
 */
export function isInlineEditingFocused(
	bridge: StudioEditorBridge | null | undefined,
): boolean {
	return (bridge?.inline?.getSession() ?? null) !== null;
}

/**
 * {@link isInlineEditingFocused} as a subscription, for chrome whose
 * *rendering* depends on it (a shortcut cheat-sheet that dims its
 * bindings, a toolbar that hides while text is being edited).
 *
 * Bound to the bridge's own external-store protocol, which the
 * controller already notifies on every session transition — no new
 * store, and no polling.
 */
export function useInlineEditingFocused(bridge: StudioEditorBridge): boolean {
	const getSnapshot = useCallback(
		() => isInlineEditingFocused(bridge),
		[bridge],
	);
	// Server render: never "editing" — sessions are client-only.
	const getServerSnapshot = useCallback(() => false, []);
	return useSyncExternalStore(bridge.subscribe, getSnapshot, getServerSnapshot);
}
