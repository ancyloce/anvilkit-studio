"use client";

/**
 * @file `useEditorLayers` — the Layers panel's editor integration
 * (PLAN-0020 CORE-P1A-010/-011; ED-LAYER-001..004).
 *
 * `null` when the visual editor is off — every affordance in the
 * layer components gates on that, keeping the legacy tree
 * byte-identical (ED-LAYER-003 regression rule). When on, exposes:
 *
 * - name preference: authoring metadata name → component label;
 * - hidden/locked flags (hidden nodes stay selectable — the §18
 *   "show hidden nodes" translucent placeholder is design-mode only);
 * - rename / set-visibility / set-lock commands through the port
 *   (`source: "layers"`, one intent each; multi-target writes are a
 *   single atomic command);
 * - the multi-selection controller (plain/toggle/range clicks).
 *
 * Every reader pulls the **live** snapshot at call time (never a
 * render-time capture): callers re-render on bridge changes through
 * `useOptionalStudioEditor`'s subscription, and the lazy reads keep
 * the stable memoized API from serving stale state between renders.
 */

import type { EditorCommandResult } from "@anvilkit/contracts/editor";
import { useMemo } from "react";
import type { EditorSelectionController } from "../../../../../../react/editor/selection.js";
import { useOptionalStudioEditor } from "../../../../../../react/editor/use-studio-editor.js";

/** What the layer components read and drive when the editor is on. */
export interface EditorLayersApi {
	/** Authoring display name, falling back to the component label. */
	readonly nameOf: (nodeId: string, fallback: string) => string;
	/** True when the node authored `hidden` at any layer. */
	readonly isHidden: (nodeId: string) => boolean;
	/** True when the node itself is locked. */
	readonly isLocked: (nodeId: string) => boolean;
	readonly rename: (
		nodeId: string,
		name: string | null,
	) => Promise<EditorCommandResult>;
	readonly setHidden: (
		nodeIds: readonly string[],
		hidden: boolean,
	) => Promise<EditorCommandResult>;
	readonly setLocked: (
		nodeIds: readonly string[],
		locked: boolean,
	) => Promise<EditorCommandResult>;
	readonly selection: EditorSelectionController;
	/** Live selected-id set (call-time read, never a stale capture). */
	readonly isSelected: (nodeId: string) => boolean;
	readonly selectedIds: () => readonly string[];
}

/** The live layers API, or `null` outside an editor-enabled Studio. */
export function useEditorLayers(): EditorLayersApi | null {
	const handle = useOptionalStudioEditor();
	const commands = handle?.commands ?? null;
	const selection = handle?.selection ?? null;
	return useMemo(() => {
		if (commands === null || selection === null) {
			return null;
		}
		const nodes = () => commands.getSnapshot().authoring.nodes;
		const execute = (
			payload: Record<string, unknown>,
		): Promise<EditorCommandResult> =>
			commands.execute({
				id: crypto.randomUUID(),
				expectedRevision: commands.getSnapshot().revision,
				source: "layers",
				timestamp: Date.now(),
				...payload,
			} as never);
		return {
			nameOf: (nodeId, fallback) => nodes()[nodeId]?.name ?? fallback,
			isHidden: (nodeId) => {
				const hidden = nodes()[nodeId]?.hidden;
				if (hidden === undefined) {
					return false;
				}
				return (
					hidden.base === true ||
					Object.values(hidden.overrides ?? {}).some((entry) => entry === true)
				);
			},
			isLocked: (nodeId) => nodes()[nodeId]?.locked === true,
			rename: (nodeId, name) => execute({ type: "node.rename", nodeId, name }),
			setHidden: (nodeIds, hidden) =>
				execute({
					type: "node.visibility.set",
					nodeIds,
					breakpointId: "base",
					hidden: hidden ? true : null,
				}),
			setLocked: (nodeIds, locked) =>
				execute({ type: "node.lock.set", nodeIds, locked }),
			selection,
			isSelected: (nodeId) => selection.getState().selectedIds.includes(nodeId),
			selectedIds: () => selection.getState().selectedIds,
		};
	}, [commands, selection]);
}
