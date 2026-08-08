"use client";

/**
 * @file `useShellSelection` — the one selection read every composition
 * panel uses (PLAN-0028 `p4-004`).
 *
 * Core owns the **full** multi-selection; Puck owns a single selected
 * item. The selection controller (`react/editor/selection.ts`) already
 * models `anchorId` / `primaryId` / `selectedIds` / `definitionScope` /
 * `mode` / `targetId` and already syncs the primary id back to Puck, so
 * this hook **binds** to it rather than duplicating any of it.
 *
 * The degraded path matters as much as the live one. A composition
 * panel can be rendered under a bare `<Puck>` with no editor bridge at
 * all — the shell's stated design goal — so when no controller is
 * installed the hook falls back to Puck's own single selection. Panels
 * then see a one-node selection instead of throwing, and every read
 * address stays plural either way.
 *
 * The **other** degraded direction matters too, and `p5-006` added it:
 * a caller can also have the bridge and *not* be inside `<Puck>` —
 * `StudioEditorMount` WRAPS `<Puck>` (`react/components/Studio.tsx:360`),
 * so everything `EditorRoot` renders (the canvas overlay, the
 * component naming dialog) sits outside the provider. Reading Puck's
 * fallback selection through {@link useOptionalReactivePuck} means
 * those surfaces read the controller normally and simply have no
 * fallback, instead of crashing on a provider they were never inside.
 *
 * **Editor state, not document state.** Selection never enters `Data`
 * and never records history, the same rule as {@link useWriteLayer}.
 */

import type { EditorSelectionState } from "@anvilkit/contracts/editor";
import { useCallback, useSyncExternalStore } from "react";
import { useOptionalReactivePuck } from "../../utils/use-reactive-puck.js";
import { useOptionalStudioEditor } from "../use-studio-editor.js";

/** The selection as the composition panels consume it. */
export interface ShellSelection {
	/**
	 * Every selected node, document order. Plural from the start —
	 * `readNodeField` and `updateAppearanceInData` are both plural, so a
	 * panel never has to widen an address later.
	 */
	readonly nodeIds: readonly string[];
	/** The primary node (the one single-node affordances act on). */
	readonly primaryId: string | null;
	/** `"page"` selects nodes; `"component"` selects a target inside one. */
	readonly mode: EditorSelectionState["mode"];
	/** The active style target in component mode; `undefined` in page mode. */
	readonly targetId: string | undefined;
	/** Which definition is being edited, or the page (§10.6 fencing). */
	readonly definitionScope: EditorSelectionState["definitionScope"];
	/** `true` when reading Puck's single selection, no controller installed. */
	readonly degraded: boolean;
}

const EMPTY_IDS: readonly string[] = Object.freeze([]);

/**
 * The live selection.
 *
 * Subscribes through `useSyncExternalStore` against the controller's
 * own `subscribe`/`getState`, so it re-renders exactly when the
 * selection changes and never on unrelated bridge traffic.
 */
export function useShellSelection(): ShellSelection {
	const editor = useOptionalStudioEditor();
	const controller = editor?.selection ?? null;

	const subscribe = useCallback(
		(onChange: () => void) =>
			controller === null ? noopUnsubscribe : controller.subscribe(onChange),
		[controller],
	);
	const getSnapshot = useCallback(
		() => (controller === null ? null : controller.getState()),
		[controller],
	);
	const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

	// Puck's own selection: the fallback when no controller is installed,
	// and read unconditionally so the hook order never varies.
	const puckSelectedId = useOptionalReactivePuck((snapshot) => {
		const props = snapshot.selectedItem?.props as
			| { readonly id?: string }
			| undefined;
		return typeof props?.id === "string" ? props.id : null;
	}, null);

	if (state === null) {
		return {
			nodeIds: puckSelectedId === null ? EMPTY_IDS : [puckSelectedId],
			primaryId: puckSelectedId,
			mode: "page",
			targetId: undefined,
			definitionScope: "page",
			degraded: true,
		};
	}
	return {
		nodeIds: state.selectedIds,
		primaryId: state.primaryId ?? null,
		mode: state.mode,
		targetId: state.targetId,
		definitionScope: state.definitionScope,
		degraded: false,
	};
}

function noopUnsubscribe(): void {
	// Intentionally empty: with no controller there is nothing to unsubscribe.
}
