"use client";

/**
 * @file `useCreateComponent` — create-component-from-selection
 * (PLAN-0028 `p5-006`; ED-COMP-001; DD-0019 §14.3).
 *
 * The whole creation — definition written to the `componentLibrary`
 * root prop, selected nodes replaced by one instance node, selection
 * moved to it — is a single history-recording `setData` dispatch, so
 * one undo restores the exact pre-creation document (freeze D-3;
 * CFX-C06).
 *
 * `p3-003` already repointed the write half onto
 * `puck/create-component.ts`. `p5-006` finishes the rebase: the
 * selection comes from {@link useShellSelection} and the `PuckApi`
 * from `useGetPuck`, so the hook no longer reaches through the command
 * port for either. The public shape of {@link CreateComponentAction}
 * is unchanged, so the toolbar and the naming dialog did not move.
 */

import type { EditorError } from "@anvilkit/contracts/editor";
import type { PuckApi } from "@puckeditor/core";
import { useCallback, useMemo } from "react";
import { randomId } from "@/shared/node-id";
import {
	commitCreateComponent,
	validateCreateComponentSelection,
} from "../../../puck/create-component.js";
import { useShellSelection } from "../composition/use-shell-selection.js";
import {
	useComponentEditorRuntime,
	useComponentWriterGateGetter,
	usePuckApiGetter,
} from "./editor-runtime.js";

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
	) => CreateComponentOutcome;
	/** True when the live selection could be captured right now. */
	readonly canCreate: boolean;
	/** The nodes a capture would take, in selection order. */
	readonly selectedNodeIds: readonly string[];
}

/**
 * The create-component action, or `null` when the document is
 * read-only or the collab gate holds writers closed.
 *
 * Usable on both sides of the `<Puck>` provider — see
 * {@link usePuckApiGetter}. The Components panel calls it from inside;
 * `CreateComponentDialog`, which `EditorRoot` mounts outside, calls it
 * from there.
 */
export function useCreateComponent(): CreateComponentAction | null {
	const selection = useShellSelection();
	const runtime = useComponentEditorRuntime();
	const getPuckApi = usePuckApiGetter();
	const getWriterGateError = useComponentWriterGateGetter();
	const selectedNodeIds = selection.nodeIds;

	const create = useCallback(
		(name: string, nodeIds?: readonly string[]): CreateComponentOutcome => {
			const api = getPuckApi();
			// No mounted store means no document to commit against; refuse
			// rather than report a no-op that reads as success.
			if (api === null) {
				return { status: "rejected", errors: [] };
			}
			const getPuck = (): PuckApi => api;
			// Explicit ids win; they are still re-validated below against the
			// CURRENT document, so a node deleted since the request was filed
			// rejects with a message rather than capturing a stale set.
			const captured = nodeIds ?? selectedNodeIds;
			const errors = validateCreateComponentSelection(
				api.appState.data,
				api.config,
				captured,
			);
			if (errors.some((error) => error.severity === "error")) {
				return { status: "rejected", errors };
			}

			const instanceNodeId = randomId();
			const result = commitCreateComponent(
				{ getPuckApi: getPuck, getWriterGateError },
				{
					nodeIds: captured,
					name,
					definitionId: randomId(),
					instanceNodeId,
					timestamp: new Date().toISOString(),
				},
			);

			if (result.status === "committed") {
				// Freeze §7 selection mapping: the new instance is selected.
				runtime.select(instanceNodeId);
				return { status: "committed", errors, instanceNodeId };
			}
			return {
				status: result.status,
				// The commit re-validates against the document that actually
				// arrived, so its verdict supersedes the pre-flight one when
				// they disagree.
				errors: result.errors.length > 0 ? result.errors : errors,
			};
		},
		[getPuckApi, getWriterGateError, runtime, selectedNodeIds],
	);

	return useMemo(() => {
		if (!runtime.canMutate) return null;
		return {
			create,
			canCreate: selectedNodeIds.length > 0,
			selectedNodeIds,
		};
	}, [runtime.canMutate, create, selectedNodeIds]);
}
