"use client";

/**
 * @file `EditorShortcuts` — the document-level keydown listener
 * binding the §18 keymap (PLAN-0020 CORE-P1A-017). Rendered by the
 * lazy editor root, so nothing registers unless the editor is on.
 *
 * Scoping (§18): the handler runs only when the event originates
 * inside `[data-ak-studio-root]` — host-global shortcuts outside the
 * Studio are never touched, and unhandled keys inside it pass through
 * untouched. Non-trusted events are dropped (the verified upstream
 * hazard: extension-injected keydowns crash Puck's `monitorHotkeys`;
 * synthetic events must never mutate documents). Typing surfaces
 * swallow every binding.
 *
 * ### Two documents, one handler (PLAN-0028 `p5-002`)
 *
 * The canvas is an iframe, so a keydown while focus is inside it is
 * dispatched in the **canvas document** and never reaches this
 * document's listener at all. Component mode is entered by clicking in
 * the canvas, which is exactly when focus is in there — so the same
 * handler is bound to the live canvas document too, restricted to the
 * mode-scoped keys (`Escape` ladder, `↑`/`↓` traversal) while
 * `mode === "component"`. Page-mode behaviour inside the canvas is
 * byte-for-byte what it was: no productivity command becomes newly
 * reachable from the iframe.
 */

import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import { useStudioPluginContext } from "../../../studio/context/plugin-context.js";
import type { StudioEditorBridge } from "../bridge.js";
import { isElementNode } from "../canvas/dom-registry.js";
import type { InternalEditorCommandPort } from "../command-port.js";
import { buildShortcutContext } from "./context.js";
import {
	EDITOR_SHORTCUT_KEYMAP,
	isTrustedEvent,
	isTypingTarget,
	matchesBinding,
	runShortcutCommand,
	runTargetTraversal,
} from "./registry.js";

/** Props for {@link EditorShortcuts}. */
export interface EditorShortcutsProps {
	readonly bridge: StudioEditorBridge;
}

/** Null-rendering keymap binder (one per editor mount). */
export default function EditorShortcuts({
	bridge,
}: EditorShortcutsProps): ReactNode {
	const ctx = useStudioPluginContext();
	const canvasDoc = useSyncExternalStore(
		bridge.subscribe,
		() => bridge.canvasDocument,
		() => bridge.canvasDocument,
	);

	useEffect(() => {
		const handler = (
			event: KeyboardEvent,
			scope: "studio" | "canvas",
		): void => {
			// Extension-injected / synthetic events: never act (hazard note).
			if (!isTrustedEvent(event)) {
				return;
			}
			const target = event.target;
			// Focus scoping: only while the Studio root owns the event. The
			// canvas document has no `[data-ak-studio-root]` of its own — a
			// keydown reaching that document IS inside the Studio, because
			// the document is the Studio's own canvas.
			if (
				scope === "studio" &&
				(!isElementNode(target) ||
					target.closest("[data-ak-studio-root]") === null)
			) {
				return;
			}
			if (isTypingTarget(target)) {
				return;
			}
			const port = bridge.port as InternalEditorCommandPort | null;
			if (port === null) {
				return;
			}

			// Component-mode traversal first: it consumes `↑`/`↓` only while
			// the mode is on, so Puck's arrow handling is untouched in page
			// mode and no keymap row can shadow it in component mode.
			if (runTargetTraversal(event, bridge, port.tryGetPuckApi?.() ?? null)) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}

			const binding = EDITOR_SHORTCUT_KEYMAP.find((entry) =>
				matchesBinding(event, entry.keys),
			);
			if (binding === undefined) {
				return;
			}
			// From the canvas document only the component-mode `Escape`
			// ladder is reachable; every other productivity command keeps
			// requiring focus in the Studio chrome, exactly as before.
			if (
				scope === "canvas" &&
				(binding.command !== "select-parent" ||
					bridge.selection?.getState().mode !== "component")
			) {
				return;
			}

			const context = buildShortcutContext(bridge, port, ctx);

			if (runShortcutCommand(binding.command, context)) {
				event.preventDefault();
				event.stopPropagation();
			}
		};
		const onStudioKey = (event: KeyboardEvent): void =>
			handler(event, "studio");
		const onCanvasKey = (event: Event): void =>
			handler(event as KeyboardEvent, "canvas");

		document.addEventListener("keydown", onStudioKey, { capture: true });
		canvasDoc?.addEventListener("keydown", onCanvasKey, { capture: true });
		return () => {
			document.removeEventListener("keydown", onStudioKey, { capture: true });
			canvasDoc?.removeEventListener("keydown", onCanvasKey, { capture: true });
		};
	}, [bridge, ctx, canvasDoc]);

	return null;
}
