"use client";

/**
 * @file `createEditorApi` and `resolveEditorIntent` — the host side of
 * PLAN-0026 §3.4's plugin/AI surface (`p3-008`).
 *
 * The API is built from the live `PuckApi` and the commit helpers, so
 * a plugin writing through it takes exactly the same path as the UI:
 * one intent, one history-recording `setData`. There is no dispatch
 * entry point and no command vocabulary anywhere in the surface.
 *
 * ## Why intents are resolved, never stored
 *
 * `resolveEditorIntent` turns one `EditorIntent` into one commit-helper
 * call and returns the outcome. Nothing is queued, nothing is
 * serialized, nothing is written back into the document. That is the
 * whole distinction from the `EditorCommand` IR being deleted: an
 * intent exists for the duration of a function call.
 *
 * ## The stale-selection failure mode
 *
 * An AI proposal is generated against one selection and applied later,
 * by which time the document may have moved on. Applying it to whatever
 * node now occupies that position would be silent corruption, so every
 * intent naming a node is checked against the **current** projection
 * first and **rejected with a diagnostic** if the node is gone. A
 * rejection is not a no-op: the caller is told, rather than seeing
 * "nothing happened" and retrying.
 */

import type { PuckApi } from "@puckeditor/core";
import { readDocument } from "../../document-model/index.js";
import { commitAnnotationUpdate } from "../../puck/update-annotations.js";
import {
	commitBindingsUpdate,
	commitInlineTextUpdate,
	commitInteractionsUpdate,
} from "../../puck/update-carriers.js";
import { commitComponentLibraryUpdate } from "../../puck/update-component-library.js";
import { commitInstanceOverride } from "../../puck/update-instance-overrides.js";
import {
	commitDeleteNodes,
	commitDuplicateNodes,
} from "../../puck/update-tree.js";
import {
	commitInstanceSelection,
	commitVariantModelUpdate,
} from "../../puck/update-variants.js";
import type {
	EditorApi,
	EditorIntent,
	EditorIntentOutcome,
} from "../../types/editor-api-v2.js";

/** Dependencies of {@link createEditorApi}. */
export interface EditorApiDeps {
	readonly getPuckApi: () => PuckApi;
	/** Change notification; the editor root supplies the bridge's. */
	readonly subscribe: (listener: () => void) => () => void;
}

function outcome(result: {
	status: string;
	errors: readonly { code: string; message: string }[];
}): EditorIntentOutcome {
	return {
		status:
			result.status === "committed"
				? "committed"
				: result.status === "noop"
					? "noop"
					: "rejected",
		errors: result.errors.map((e) => ({ code: e.code, message: e.message })),
	};
}

/** Build the three-surface editor API. */
export function createEditorApi(deps: EditorApiDeps): EditorApi {
	const puck = { getPuckApi: deps.getPuckApi };
	return {
		readDocument: () => {
			const api = deps.getPuckApi();
			return readDocument(api.appState.data, api.config);
		},
		subscribe: deps.subscribe,
		commit: {
			componentLibrary: (edit) =>
				outcome(commitComponentLibraryUpdate(puck, edit)),
			variantModel: (definitionId, edit) =>
				outcome(commitVariantModelUpdate(puck, definitionId, edit)),
			instanceSelection: (nodeIds, selection) =>
				outcome(commitInstanceSelection(puck, nodeIds, selection)),
			instanceOverride: (nodeIds, edit) =>
				outcome(commitInstanceOverride(puck, nodeIds, edit)),
			interactions: (nodeId, update) =>
				commitInteractionsUpdate(puck, nodeId, update),
			bindings: (nodeId, update) => commitBindingsUpdate(puck, nodeId, update),
			inlineText: (input) =>
				commitInlineTextUpdate(puck, {
					nodeId: input.nodeId,
					targetId: input.targetId,
					value: input.value as string,
				}),
			annotation: (edit) => outcome(commitAnnotationUpdate(puck, edit)),
			deleteNodes: (nodeIds) => commitDeleteNodes(puck, nodeIds),
			duplicateNodes: (nodeIds) => commitDuplicateNodes(puck, nodeIds),
		},
	};
}

const rejected = (message: string, code = "EDITOR_NODE_NOT_FOUND") =>
	({ status: "rejected", errors: [{ code, message }] }) as EditorIntentOutcome;

/** The node ids an intent addresses. */
function addressedNodes(intent: EditorIntent): readonly string[] {
	switch (intent.kind) {
		case "set-instance-variant":
		case "delete-nodes":
			return intent.nodeIds;
		default:
			return [intent.nodeId];
	}
}

/**
 * Resolve one intent to one commit-helper call.
 *
 * Every addressed node is validated against the **current** document
 * before anything commits — see the stale-selection note above.
 */
export function resolveEditorIntent(
	api: EditorApi,
	intent: EditorIntent,
): EditorIntentOutcome {
	const model = api.readDocument();
	const missing = addressedNodes(intent).filter(
		(nodeId) => !model.nodes.has(nodeId),
	);
	if (missing.length > 0) {
		return rejected(
			`intent "${intent.kind}" addresses ${missing.length === 1 ? "a node" : "nodes"} that no longer exist: ${missing.join(", ")}`,
		);
	}

	switch (intent.kind) {
		case "set-inline-text":
			return outcome(
				api.commit.inlineText({
					nodeId: intent.nodeId,
					targetId: intent.targetId,
					value: intent.value,
				}),
			);
		case "set-interactions":
			return outcome(
				api.commit.interactions(intent.nodeId, () => intent.interactions),
			);
		case "set-bindings":
			return outcome(api.commit.bindings(intent.nodeId, () => intent.bindings));
		case "set-instance-variant":
			return api.commit.instanceSelection(intent.nodeIds, intent.selection);
		case "rename-node":
			return api.commit.annotation({
				kind: "rename",
				nodeId: intent.nodeId,
				name: intent.name,
			});
		case "delete-nodes":
			return outcome(api.commit.deleteNodes(intent.nodeIds));
	}
}
