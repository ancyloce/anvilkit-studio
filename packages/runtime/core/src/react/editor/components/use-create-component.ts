"use client";

/**
 * @file `useCreateComponent` — create-component-from-selection
 * (ED-COMP-001; DD-0019 §14.3).
 *
 * The whole creation — definition written to the `componentLibrary`
 * root prop, selected nodes replaced by one instance node, selection
 * moved to it — is a single history-recording `setData` dispatch, so
 * one undo restores the exact pre-creation document (freeze D-3;
 * CFX-C06).
 *
 * **Repointed off the sidecar** onto `puck/create-component.ts`: the
 * definition now lands on a declared root prop and the instance
 * carrier on the instance node's own props, so `p3-009` can delete
 * `editor/components/create.ts` without taking this behaviour with it.
 * The public shape of {@link CreateComponentAction} is unchanged, so
 * the toolbar and the naming dialog did not move.
 *
 * Entry-chunk safe: the reducer loads through a dynamic `import()`
 * inside the handler, matching `useEditorNativeActions`.
 */

import type { EditorError } from "@anvilkit/contracts/editor";
import type { PuckApi } from "@puckeditor/core";
import { use, useCallback, useMemo, useSyncExternalStore } from "react";
import type { InternalEditorCommandPort } from "../command-port.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";

/** The outcome of a create-component attempt. */
export interface CreateComponentOutcome {
	readonly status: "committed" | "rejected" | "noop";
	readonly errors: readonly EditorError[];
	/** The new instance node id, when one was created. */
	readonly instanceNodeId?: string;
}

/** Create a document-local component from the current selection. */
export interface CreateComponentAction {
	/**
	 * Capture `nodeIds` — defaulting to the live selection — under `name`.
	 *
	 * The dialog passes the ids the toolbar validated and filed on
	 * `bridge.componentCapture`, because the selection can move between
	 * filing the request and confirming the name: a collab peer's edit,
	 * an undo that remaps selection, or a programmatic `select()` from
	 * another surface. Re-reading the live selection at confirm time
	 * captured a different set of nodes than the one the user targeted
	 * and than the one that was validated.
	 */
	readonly create: (
		name: string,
		nodeIds?: readonly string[],
	) => Promise<CreateComponentOutcome>;
	/** True when the live selection could be captured right now. */
	readonly canCreate: boolean;
}

/**
 * The create-component action, or `null` when the editor is off,
 * still loading, read-only, or the collab gate holds writers closed.
 */
export function useCreateComponent(): CreateComponentAction | null {
	const bridge = use(StudioEditorBridgeContext);
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);

	const port = bridge?.port as InternalEditorCommandPort | null | undefined;

	const create = useCallback(
		async (
			name: string,
			nodeIds?: readonly string[],
		): Promise<CreateComponentOutcome> => {
			if (bridge == null || port == null) {
				return { status: "rejected", errors: [] };
			}
			// No mounted store means no document to commit against; refuse
			// rather than report a no-op that reads as success.
			const api = port.tryGetPuckApi?.() ?? null;
			if (api === null) {
				return { status: "rejected", errors: [] };
			}
			const getPuck = (): PuckApi => api;
			const { commitCreateComponent, validateCreateComponentSelection } =
				await import("../../../puck/create-component.js");
			// Explicit ids win; they are still re-validated below against the
			// CURRENT document, so a node deleted since the request was filed
			// rejects with a message rather than capturing a stale set.
			const selection = nodeIds ?? port.getSnapshot().selection.selectedIds;
			const data = api.appState.data;
			const config = api.config;

			const errors = validateCreateComponentSelection(data, config, selection);
			if (errors.some((error) => error.severity === "error")) {
				return { status: "rejected", errors };
			}

			const definitionId = crypto.randomUUID();
			const instanceNodeId = crypto.randomUUID();
			const timestamp = new Date().toISOString();

			const result = commitCreateComponent(
				{ getPuckApi: getPuck },
				{
					nodeIds: selection,
					name,
					definitionId,
					instanceNodeId,
					timestamp,
				},
			);

			if (result.status === "committed") {
				// Freeze §7 selection mapping: the new instance is selected.
				bridge.selection?.select(instanceNodeId);
				return { status: "committed", errors, instanceNodeId };
			}
			return {
				status: result.status === "noop" ? "noop" : "rejected",
				// The commit re-validates against the document that actually
				// arrived, so its verdict supersedes the pre-flight one when
				// they disagree.
				errors: result.errors.length > 0 ? result.errors : errors,
			};
		},
		[bridge, port],
	);

	return useMemo(() => {
		void version;
		if (bridge == null || port == null) {
			return null;
		}
		if (port.isReadOnly() || port.writersDisabled()) {
			return null;
		}
		return {
			create,
			canCreate: port.getSnapshot().selection.selectedIds.length > 0,
		};
	}, [bridge, port, create, version]);
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
