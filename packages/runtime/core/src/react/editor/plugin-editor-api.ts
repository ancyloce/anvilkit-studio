"use client";

/**
 * @file `createPluginEditorApi` — the `StudioPluginContext.editor`
 * facade (PLAN-0020 CORE-P1A-003; DD-0019 §21.1; DD-DEC-014).
 *
 * Entry-chunk safe: contract types only, no engine imports. The
 * facade is attached to the plugin context at compile time — before
 * the lazily-loaded editor runtime exists — so every member delegates
 * to the bridge and degrades **deterministically** while the chunk is
 * still loading: reads return empty snapshots, writes reject with a
 * recoverable `EDITOR_COMMAND_CONFLICT` (`details.reason:
 * "port-not-ready"`), and subscriptions armed early start delivering
 * once the runtime mounts. No raw store handle ever crosses this
 * boundary (the store-isolation invariant).
 */

import type {
	EditorError,
	EditorSelectionState,
	StudioEditorConfig,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommand,
} from "../../editor/legacy/index.js";
import type {
	AuthoringStateV1,
	EditorCommandPort,
	EditorCommandResult,
	EditorCommandSnapshot,
	EditorPreviewResult,
} from "../../editor/legacy/index.js";
import type {
	EditorSelectionReader,
	StudioPluginEditorApi,
} from "../../types/editor-api.js";
import type { StudioEditorBridge } from "./bridge.js";

const EMPTY_AUTHORING: AuthoringStateV1 = {
	version: "1",
	revision: 0,
	breakpoints: [],
	nodes: {},
	tokens: {},
	tokenModes: {},
	styleDefinitions: {},
	componentDefinitions: {},
	interactions: {},
	bindings: {},
};

const EMPTY_SELECTION: EditorSelectionState = {
	selectedIds: [],
	scope: "page",
};

function portNotReadyError(): EditorError {
	return {
		code: "EDITOR_COMMAND_CONFLICT",
		severity: "error",
		message:
			"the editor runtime has not finished loading yet — re-read the snapshot and retry",
		recoverable: true,
		details: { reason: "port-not-ready" },
	};
}

function facadeCommandPort(
	bridge: StudioEditorBridge,
	editor: StudioEditorConfig,
): EditorCommandPort {
	const emptySnapshot = (): EditorCommandSnapshot => ({
		revision: 0,
		authoring: EMPTY_AUTHORING,
		selection: bridge.selection?.getState() ?? EMPTY_SELECTION,
		breakpoints: editor.breakpoints ?? [],
	});
	return {
		execute(command: EditorCommand): Promise<EditorCommandResult> {
			const port = bridge.port;
			if (port === null) {
				return Promise.resolve({
					status: "rejected",
					revision: 0,
					changedNodeIds: [],
					errors: [portNotReadyError()],
				});
			}
			return port.execute(command);
		},
		preview(command: EditorCommand): EditorPreviewResult {
			const port = bridge.port;
			if (port === null) {
				return {
					valid: false,
					errors: [portNotReadyError()],
					changedNodeIds: [],
				};
			}
			return port.preview(command);
		},
		validate(command: EditorCommand): readonly EditorError[] {
			return bridge.port?.validate(command) ?? [portNotReadyError()];
		},
		getSnapshot(): EditorCommandSnapshot {
			return bridge.port?.getSnapshot() ?? emptySnapshot();
		},
	};
}

function facadeSelectionReader(
	bridge: StudioEditorBridge,
): EditorSelectionReader {
	return {
		getState: () => bridge.selection?.getState() ?? EMPTY_SELECTION,
		subscribe(listener) {
			// Bridge-level subscription so a listener armed before the lazy
			// runtime mounts still starts receiving changes afterwards.
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
}

/**
 * Build the `ctx.editor` member for one `<Studio>` instance. Attached
 * only when the host enabled the editor feature — its presence IS the
 * feature signal for plugins.
 */
export function createPluginEditorApi(
	bridge: StudioEditorBridge,
	editor: StudioEditorConfig,
): StudioPluginEditorApi {
	return {
		version: "1",
		commands: facadeCommandPort(bridge, editor),
		selection: facadeSelectionReader(bridge),
		capabilities: {
			forComponent: (componentType) =>
				bridge.capabilities?.forComponent(componentType),
			forNode: (nodeId) => bridge.capabilities?.forNode(nodeId),
			listUsedFeatures: () => bridge.capabilities?.listUsedFeatures() ?? [],
		},
		diagnostics: bridge.diagnostics,
	};
}
