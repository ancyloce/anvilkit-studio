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
 */

import { type ReactNode, useEffect } from "react";
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

	useEffect(() => {
		const handler = (event: KeyboardEvent): void => {
			// Extension-injected / synthetic events: never act (hazard note).
			if (!isTrustedEvent(event)) {
				return;
			}
			// Focus scoping: only while the Studio root owns the event.
			const target = event.target;
			if (
				!isElementNode(target) ||
				target.closest("[data-ak-studio-root]") === null
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
			const binding = EDITOR_SHORTCUT_KEYMAP.find((entry) =>
				matchesBinding(event, entry.keys),
			);
			if (binding === undefined) {
				return;
			}

			const context = buildShortcutContext(bridge, port, ctx);

			if (runShortcutCommand(binding.command, context)) {
				event.preventDefault();
				event.stopPropagation();
			}
		};

		document.addEventListener("keydown", handler, { capture: true });
		return () =>
			document.removeEventListener("keydown", handler, { capture: true });
	}, [bridge, ctx]);

	return null;
}
