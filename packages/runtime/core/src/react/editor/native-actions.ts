"use client";

/**
 * @file `useEditorNativeActions` — Core-owned duplicate/delete with
 * sidecar reconciliation in one dispatch (PLAN-0020 CORE-P1A-016
 * tier (a)).
 *
 * Entry-chunk safe: the tree transforms and the engine load through
 * dynamic `import()` inside the handlers (already resident once the
 * editor runtime mounted — same chunk group). Returns `null` when the
 * editor is off, still loading, the document is read-only, or the
 * collab gate holds writers closed — callers then keep dispatching
 * Puck's native `duplicate`/`remove` actions, whose dangling sidecar
 * records the tier-(b) lazy GC collects on the next commit.
 *
 * Duplicate honors invariant 5: the copy carries the source's
 * authoring (layout/style/typography/hidden/name/locked) via
 * `remapForDuplicate`; interaction/binding refs are never shared.
 * The copy becomes the selection (freeze §7 mapping rule).
 */

import { use, useMemo, useSyncExternalStore } from "react";
import type { InternalEditorCommandPort } from "./command-port.js";
import { StudioEditorBridgeContext } from "./use-studio-editor.js";

/** One-dispatch native mutations over the selected node. */
export interface EditorNativeActions {
	readonly duplicate: (nodeId: string) => Promise<void>;
	readonly remove: (nodeId: string) => Promise<void>;
}

/** The editor-aware duplicate/delete pair, or `null` (use legacy). */
export function useEditorNativeActions(): EditorNativeActions | null {
	const bridge = use(StudioEditorBridgeContext);
	const ready = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? no : () => bridge.port !== null,
		bridge === null ? no : () => bridge.port !== null,
	);
	return useMemo(() => {
		if (bridge === null || !ready) {
			return null;
		}
		const port = bridge.port as InternalEditorCommandPort | null;
		if (port === null || port.isReadOnly() || port.writersDisabled()) {
			return null;
		}
		return {
			duplicate: async (nodeId) => {
				const [{ duplicateNode }, { remapForDuplicate }] = await Promise.all([
					import("./native-tree.js"),
					import("../../editor/index.js"),
				]);
				let newRootId: string | null = null;
				port.commitNative((data, authoring) => {
					const duplicated = duplicateNode(data, nodeId);
					if (duplicated === null) {
						return null;
					}
					newRootId = duplicated.newRootId;
					const remapped = remapForDuplicate(authoring, duplicated.idMap);
					return { data: duplicated.data, authoring: remapped.state };
				});
				if (newRootId !== null) {
					bridge.selection?.select(newRootId);
				}
			},
			remove: async (nodeId) => {
				const { removeNode } = await import("./native-tree.js");
				port.commitNative((data, authoring) => {
					const next = removeNode(data, nodeId);
					// Records for the removed subtree strip inside the same
					// commit (commitNative reconciles against the new tree).
					return next === null ? null : { data: next, authoring };
				});
				bridge.selection?.clear();
			},
		};
	}, [bridge, ready]);
}

function noopSubscribe(): () => void {
	return noop;
}
function noop(): void {
	// The no-bridge store never changes.
}
function no(): boolean {
	return false;
}
