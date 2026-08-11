"use client";

/**
 * @file `useEditorTreeActions` — editor-aware duplicate/delete for
 * chrome surfaces (`p3-009`; replaces `native-actions.ts`).
 *
 * `useEditorNativeActions` folded a tree change and a sidecar
 * reconciliation into one `port.commitNative` dispatch. Both halves of
 * that are gone: there is no sidecar to reconcile, and the tree change
 * has a first-class commit helper (`commitDuplicateNodes` /
 * `commitDeleteNodes`, `p3-005`) that already performs the identical
 * one-intent / one-`recordHistory` dispatch, honours Puck's own
 * `getPermissions`, and refuses a locked node (`p3-006`).
 *
 * Carriers survive duplication for free: they live in the duplicated
 * node's own props, so the copy carries its appearance, interactions
 * and bindings by construction. `remapForDuplicate` — the sidecar-era
 * step that re-keyed a flat record map onto the new ids — has no
 * counterpart because there is no flat map to re-key.
 *
 * Returns `null` when the editor is off, the store is not mounted, or
 * the collab gate holds writers closed. Callers then fall back to
 * Puck's own `duplicate`/`remove` reducer actions, exactly as before.
 */

import type { PuckApi } from "@puckeditor/core";
import { use, useMemo, useSyncExternalStore } from "react";
import {
	commitDeleteNodes,
	commitDuplicateNodes,
} from "../../puck/update-tree.js";
import { StudioEditorBridgeContext } from "./use-studio-editor.js";

/** One-dispatch tree mutations over one node. */
export interface EditorTreeActions {
	readonly duplicate: (nodeId: string) => void;
	readonly remove: (nodeId: string) => void;
}

/** The editor-aware duplicate/delete pair, or `null` (use Puck's own). */
export function useEditorTreeActions(): EditorTreeActions | null {
	const bridge = use(StudioEditorBridgeContext);
	// The gate flips on collab-capability changes and on runtime
	// installation, both of which bump the bridge version.
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);
	return useMemo(() => {
		void version;
		if (bridge === null) {
			return null;
		}
		if (bridge.getPuckApi() === null || bridge.getWriterGateError() !== null) {
			return null;
		}
		const deps = {
			getPuckApi: () => bridge.getPuckApi() as PuckApi,
			getWriterGateError: () => bridge.getWriterGateError(),
		};
		return {
			duplicate: (nodeId) => {
				const result = commitDuplicateNodes(deps, [nodeId]);
				// Freeze §7: the copy becomes the selection.
				const copyId = result.createdNodeIds.at(-1);
				if (result.status === "committed" && copyId !== undefined) {
					bridge.selection?.select(copyId);
				}
			},
			remove: (nodeId) => {
				if (commitDeleteNodes(deps, [nodeId]).status === "committed") {
					bridge.selection?.clear();
				}
			},
		};
	}, [bridge, version]);
}

function noopSubscribe(): () => void {
	return noop;
}
function noop(): void {
	// The no-bridge store never changes.
}
function zero(): number {
	return 0;
}
