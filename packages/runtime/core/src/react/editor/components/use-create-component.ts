"use client";

/**
 * @file `useCreateComponent` — create-component-from-selection wired
 * to the port (PLAN-0020 CORE-P2-004; ED-COMP-001; DD-0019 §14.3).
 *
 * The whole creation — definition written to the sidecar, selected
 * nodes replaced by one instance node, selection moved to it — is a
 * single `commitNative` and therefore **one** history-recording
 * dispatch, so one undo restores the exact pre-creation document
 * (freeze D-3; CFX-C06).
 *
 * Entry-chunk safe: the engine loads through a dynamic `import()`
 * inside the handler, matching `useEditorNativeActions`.
 */

import type { EditorError } from "@anvilkit/contracts/editor";
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
			const { buildCreateComponentPlan, validateCreateComponentSelection } =
				await import("../../../editor/index.js");
			// Explicit ids win; they are still re-validated below against the
			// CURRENT document, so a node deleted since the request was filed
			// rejects with a message rather than capturing a stale set.
			const selection = nodeIds ?? port.getSnapshot().selection.selectedIds;
			const data = port.readData();
			const authoring = port.getSnapshot().authoring;

			const errors = validateCreateComponentSelection(
				data,
				authoring,
				selection,
			);
			if (errors.some((error) => error.severity === "error")) {
				return { status: "rejected", errors };
			}

			const definitionId = crypto.randomUUID();
			const instanceNodeId = crypto.randomUUID();
			const timestamp = new Date().toISOString();

			const result = port.commitNative((currentData, currentAuthoring) => {
				const plan = buildCreateComponentPlan(currentData, currentAuthoring, {
					nodeIds: selection,
					name,
					definitionId,
					instanceNodeId,
					timestamp,
				});
				return plan === null
					? null
					: { data: plan.data, authoring: plan.authoring };
			});

			if (result === "committed") {
				// Freeze §7 selection mapping: the new instance is selected.
				bridge.selection?.select(instanceNodeId);
				return { status: "committed", errors, instanceNodeId };
			}
			return { status: result === "noop" ? "noop" : "rejected", errors };
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
