"use client";

/**
 * @file `createPluginEditorFacade` — the `StudioPluginContext.editor`
 * facade (DD-0019 §21.1; PLAN-0026 §3.4).
 *
 * Replaces `plugin-editor-api.ts`, deleted with the command engine in
 * `p3-009`. The shape of the problem is unchanged and so is the
 * solution: the facade is attached to the plugin context at **compile
 * time**, before the lazily-loaded editor runtime exists, so every
 * member has to degrade deterministically while the chunk is still
 * loading. What changed is what it delegates to — `EditorApi`'s read
 * projection and commit helpers (`p3-008`) instead of a command port.
 *
 * Entry-chunk safe: contract types only, no engine, schema or Puck
 * runtime imports. No raw store handle ever crosses this boundary (the
 * store-isolation invariant).
 *
 * ### Degradation, spelled out
 *
 * - `readDocument()` before the runtime mounts returns an **empty
 *   model**, not a throw: a plugin reading during `onInit` must not
 *   crash the compile.
 * - every `commit.*` before the runtime mounts returns
 *   `status: "rejected"` with a recoverable
 *   `EDITOR_COMMAND_CONFLICT` naming `reason: "editor-not-ready"`. A
 *   rejection, never a `"noop"` — "the editor is not up yet" and
 *   "nothing needed changing" are different facts.
 * - `subscribe()` armed early is live from the moment it is called:
 *   it subscribes to the bridge, which exists from mount, so a plugin
 *   that subscribes during `onInit` receives the runtime's own
 *   installation notification.
 */

import type { EditorSelectionState } from "@anvilkit/contracts/editor";
import type { Config, Data } from "@puckeditor/core";
import { readDocument } from "../../document-model/index.js";
import type { DocumentModel } from "../../document-model/types.js";
import type {
	EditorSelectionReader,
	StudioPluginEditorApi,
} from "../../types/editor-api.js";
import type {
	EditorApi,
	EditorCommitApi,
	EditorCommitOutcome,
} from "../../types/editor-api-v2.js";
import type { StudioEditorBridge } from "./bridge.js";

const EMPTY_SELECTION: EditorSelectionState = {
	selectedIds: [],
	definitionScope: "page",
	mode: "page",
};

/** The refusal every commit returns before the runtime installs. */
function notReady(): EditorCommitOutcome {
	return {
		status: "rejected",
		errors: [
			{
				code: "EDITOR_COMMAND_CONFLICT",
				message:
					"the editor runtime has not finished mounting; the write was not applied",
			},
		],
	};
}

/**
 * An empty read projection for the pre-mount window.
 *
 * Built by running the REAL `readDocument` over an empty document
 * rather than hand-assembling a literal: a hand-written stand-in drifts
 * the moment `DocumentModel` gains a member, and it would drift
 * silently because the only consumer is a degraded path nobody
 * exercises. `config` is the empty config the same document would be
 * projected against.
 */
function emptyModel(): DocumentModel {
	return readDocument(
		{ root: { props: {} }, content: [], zones: {} } as Data,
		{ components: {} } as Config,
	);
}

/**
 * Every commit member, bound to whatever the bridge currently holds.
 *
 * Written as one delegating proxy rather than eleven hand-copied
 * members so a new member on `EditorCommitApi` cannot be silently
 * omitted here — the previous facade's per-member list is exactly how
 * a surface drifts from the interface it claims to implement.
 */
function commitFacade(bridge: StudioEditorBridge): EditorCommitApi {
	const handler: ProxyHandler<Record<string, unknown>> = {
		get: (_target, property: string | symbol) => {
			return (...args: readonly unknown[]) => {
				const api = bridge.api;
				if (api === null) {
					return notReady();
				}
				const member = (api.commit as unknown as Record<string, unknown>)[
					property as string
				];
				if (typeof member !== "function") {
					return notReady();
				}
				return (
					member as (...values: readonly unknown[]) => EditorCommitOutcome
				)(...args);
			};
		},
	};
	return new Proxy({}, handler) as unknown as EditorCommitApi;
}

/** Build the per-`<Studio>` plugin editor facade. */
export function createPluginEditorFacade(
	bridge: StudioEditorBridge,
): StudioPluginEditorApi {
	const selection: EditorSelectionReader = {
		getState: () => bridge.selection?.getState() ?? EMPTY_SELECTION,
		subscribe: (listener) => {
			// The controller may not exist yet, so subscribe to the BRIDGE
			// and re-read on every wake — an early subscriber then starts
			// receiving states the moment the controller installs, instead
			// of holding a subscription to a `null` that never fires.
			let last = bridge.selection?.getState() ?? EMPTY_SELECTION;
			return bridge.subscribe(() => {
				const next = bridge.selection?.getState() ?? EMPTY_SELECTION;
				if (next !== last) {
					last = next;
					listener(next);
				}
			});
		},
	};

	const editor: EditorApi = {
		readDocument: () => bridge.api?.readDocument() ?? emptyModel(),
		subscribe: (listener) => bridge.subscribe(listener),
		commit: commitFacade(bridge),
	};

	return {
		version: "1",
		editor,
		selection,
		capabilities: {
			forComponent: (componentType) =>
				bridge.capabilities?.forComponent(componentType),
			forNode: (nodeId) => bridge.capabilities?.forNode(nodeId),
			listUsedFeatures: () => bridge.capabilities?.listUsedFeatures() ?? [],
		},
		diagnostics: bridge.diagnostics,
	};
}
