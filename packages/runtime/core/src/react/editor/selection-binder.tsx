"use client";

/**
 * @file `EditorSelectionBinder` — the Puck→Core selection feed
 * (PLAN-0020 CORE-P1A-002).
 *
 * Must render **inside** Puck's subtree (composed into the `puck`
 * override next to `PuckApiBinder`) because only there can it
 * subscribe to Puck's selected item reactively. Entry-chunk safe: it
 * forwards the selected node id into the bridge, where the lazily
 * loaded selection controller picks it up — a no-op until the editor
 * chunk mounts, and never rendered at all unless the editor feature
 * is enabled.
 */

import { type ReactNode, useEffect } from "react";
import { useReactivePuck } from "../utils/use-reactive-puck.js";
import type { StudioEditorBridge } from "./bridge.js";

/** Props for {@link EditorSelectionBinder}. */
export interface EditorSelectionBinderProps {
	readonly bridge: StudioEditorBridge;
}

/**
 * Null-rendering subscriber: mirrors Puck's selected item id into the
 * bridge on every change (including deselection).
 */
export function EditorSelectionBinder({
	bridge,
}: EditorSelectionBinderProps): ReactNode {
	const selectedId = useReactivePuck((snapshot) => {
		const props = snapshot.selectedItem?.props as
			| { readonly id?: string }
			| undefined;
		return typeof props?.id === "string" ? props.id : null;
	});
	useEffect(() => {
		bridge.onPuckSelectedChange?.(selectedId);
	}, [bridge, selectedId]);
	return null;
}
