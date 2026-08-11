"use client";

/**
 * @file `useEditorLayers` — the Layers panel's editor integration
 * (PLAN-0020 CORE-P1A-010/-011; ED-LAYER-001..004).
 *
 * `null` when the visual editor is off — every affordance in the
 * layer components gates on that, keeping the legacy tree
 * byte-identical (ED-LAYER-003 regression rule). When on, exposes:
 *
 * - name preference: the `editorAnnotations` name → component label;
 * - hidden/locked flags (hidden nodes stay selectable — the §18
 *   "show hidden nodes" translucent placeholder is design-mode only);
 * - rename / set-visibility / set-lock, each ONE history entry;
 * - the multi-selection controller (plain/toggle/range clicks).
 *
 * Every reader pulls the **live** document at call time (never a
 * render-time capture): callers re-render on bridge changes through
 * `useOptionalStudioEditor`'s subscription, and the lazy reads keep
 * the stable memoized API from serving stale state between renders.
 *
 * ### `p3-009`
 *
 * Reads were `commands.getSnapshot().authoring.nodes` — the sidecar's
 * flat record map. `name` and `locked` are now the `editorAnnotations`
 * root prop (`p3-006`) and `hidden` is the per-target appearance
 * carrier (§5.1), so both are read from the live `Data` through the
 * canonical readers. Writes were `node.rename` / `node.lock.set` /
 * `node.visibility.set` commands; they are `commitAnnotationUpdate`
 * and `commitAppearanceUpdate`.
 *
 * **One behaviour narrowed, deliberately.** `node.lock.set` and
 * `node.visibility.set` took a node LIST and produced ONE history
 * entry for the whole selection. `AnnotationEdit` addresses a single
 * node, so a multi-node lock is now one entry per node. Visibility
 * keeps its atomicity — `commitAppearanceUpdate` is plural by
 * construction. Recorded on the deferred-verification ledger rather
 * than hidden; restoring it needs a plural `AnnotationEdit`, which is
 * a contract change and not this task's.
 */

import type { Config, Data, PuckApi } from "@puckeditor/core";
import { use, useMemo } from "react";
import {
	collectAppearanceNodes,
	documentBreakpoints,
	readTargetHidden,
} from "../../../../../../puck/read-appearance.js";
import { ROOT_STYLE_TARGET_ID } from "../../../../../../puck/targets.js";
import {
	commitAnnotationUpdate,
	isNodeLocked,
	readEditorAnnotations,
} from "../../../../../../puck/update-annotations.js";
import { commitAppearanceUpdate } from "../../../../../../puck/update-appearance.js";
import type { EditorSelectionController } from "../../../../../../react/editor/selection.js";
import { StudioEditorBridgeContext } from "../../../../../../react/editor/use-studio-editor.js";
import { useOptionalStudioEditor } from "../../../../../../react/editor/use-studio-editor.js";

/** The outcome of one layers write. */
export interface LayersWriteResult {
	readonly status: "committed" | "noop" | "rejected";
}

/** What the layer components read and drive when the editor is on. */
export interface EditorLayersApi {
	/** Authoring display name, falling back to the component label. */
	readonly nameOf: (nodeId: string, fallback: string) => string;
	/** True when the node authored `hidden` at any layer. */
	readonly isHidden: (nodeId: string) => boolean;
	/** True when the node itself is locked. */
	readonly isLocked: (nodeId: string) => boolean;
	readonly rename: (nodeId: string, name: string | null) => LayersWriteResult;
	readonly setHidden: (
		nodeIds: readonly string[],
		hidden: boolean,
	) => LayersWriteResult;
	readonly setLocked: (
		nodeIds: readonly string[],
		locked: boolean,
	) => LayersWriteResult;
	readonly selection: EditorSelectionController;
	/** Live selected-id set (call-time read, never a stale capture). */
	readonly isSelected: (nodeId: string) => boolean;
	readonly selectedIds: () => readonly string[];
}

const REJECTED: LayersWriteResult = { status: "rejected" };

/** The live layers API, or `null` outside an editor-enabled Studio. */
export function useEditorLayers(): EditorLayersApi | null {
	const handle = useOptionalStudioEditor();
	const bridge = use(StudioEditorBridgeContext);
	const ready = handle?.status === "ready";
	const selection = handle?.selection ?? null;
	return useMemo(() => {
		if (bridge === null || !ready || selection === null) {
			return null;
		}
		const deps = {
			getPuckApi: () => bridge.getPuckApi() as PuckApi,
			getWriterGateError: () => bridge.getWriterGateError(),
		};
		/** The live document, or `null` before `<Puck>` mounts. */
		const live = (): Data | null =>
			(bridge.getPuckApi()?.appState.data as Data | undefined) ?? null;
		return {
			nameOf: (nodeId, fallback) => {
				const data = live();
				if (data === null) return fallback;
				return readEditorAnnotations(data)?.[nodeId]?.name ?? fallback;
			},
			isHidden: (nodeId) => {
				const api = bridge.getPuckApi();
				if (api === null) return false;
				const data = api.appState.data as Data;
				const config = api.config as Config;
				const breakpoints = documentBreakpoints(data);
				const nodes = collectAppearanceNodes(data, config);
				// "Hidden at ANY layer", the same question the sidecar's
				// `hidden.base || some(overrides)` asked — asked here one layer
				// at a time because the carrier read is layer-addressed.
				for (const layer of ["base", ...breakpoints.map((b) => b.id)]) {
					const state = readTargetHidden({
						nodes,
						config,
						breakpoints,
						nodeIds: [nodeId],
						targetId: ROOT_STYLE_TARGET_ID,
						layer,
					});
					if (state.kind === "value" && state.value === true) return true;
				}
				return false;
			},
			isLocked: (nodeId) => {
				const data = live();
				return data !== null && isNodeLocked(data, nodeId);
			},
			rename: (nodeId, name) =>
				commitAnnotationUpdate(
					deps,
					name === null
						? { kind: "clear-name", nodeId }
						: { kind: "rename", nodeId, name },
				),
			setHidden: (nodeIds, hidden) => {
				const api = bridge.getPuckApi();
				if (api === null) return REJECTED;
				return commitAppearanceUpdate(deps, {
					config: api.config as Config,
					nodeIds,
					targetId: ROOT_STYLE_TARGET_ID,
					layer: "base",
					// `undefined` REMOVES the entry — the canonical spelling of
					// the deleted command's `hidden: null`.
					patch: { kind: "set-hidden", value: hidden ? true : undefined },
				});
			},
			setLocked: (nodeIds, locked) => {
				let status: LayersWriteResult["status"] = "noop";
				for (const nodeId of nodeIds) {
					const result = commitAnnotationUpdate(deps, {
						kind: "set-locked",
						nodeId,
						locked,
					});
					if (result.status === "rejected") return REJECTED;
					if (result.status === "committed") status = "committed";
				}
				return { status };
			},
			selection,
			isSelected: (nodeId) => selection.getState().selectedIds.includes(nodeId),
			selectedIds: () => selection.getState().selectedIds,
		};
	}, [bridge, ready, selection]);
}
