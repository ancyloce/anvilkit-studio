"use client";

/**
 * @file `useBindingEditor` — state for the bindings inspector section
 * (PLAN-0020 CORE-P3-006; ED-BIND-002/003; DD-0019 §19).
 *
 * Joins three things the section needs: the node's existing bindings
 * from the sidecar, the host's data sources, and a save action that
 * goes through the ordinary command port.
 *
 * Returns `null` when no data-source adapter is configured. §19 makes
 * the adapter the only source of bindable data, so an editor without
 * one has nothing to bind against and the section hides entirely
 * rather than rendering an unusable form.
 */

import type {
	BindingTarget,
	Binding,
	DataSourceDescriptor,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommandResult,
} from "../../../editor/legacy/index.js";
import { useCallback, useMemo, useState } from "react";
import type { PreviewDataResult } from "../../../editor/index.js";
import type { EditorInspectorContext } from "../inspector/use-inspector.js";
import { useDataSources, usePreviewData } from "./use-data-sources.js";

/** What the bindings section renders and drives. */
export interface BindingEditorState {
	/** Bindings already attached to the selected node. */
	readonly bindings: readonly Binding[];
	readonly sources: readonly DataSourceDescriptor[];
	/** Live preview for the selected source, or `null` before one is chosen. */
	readonly preview: PreviewDataResult | null;
	readonly saveBinding: (input: {
		readonly target: BindingTarget;
		readonly dataPath: readonly string[];
	}) => Promise<EditorCommandResult | null>;
	readonly lastErrors: readonly string[];
}

/**
 * Binding editor state, or `null` when the host has no adapter.
 *
 * `sourceId` is owned by the caller. Latching it inside the hook would
 * mean setting state during render — legal in React's
 * adjust-state-on-prop-change pattern, but fragile and easy to turn
 * into a loop. The section already holds it, so it is simply passed in.
 */
export function useBindingEditor(
	context: EditorInspectorContext,
	sourceId: string,
): BindingEditorState | null {
	const { authoring, commands, revision, selection } = context;
	const [lastErrors, setLastErrors] = useState<readonly string[]>([]);
	const primaryId = selection.primaryId;

	const sourceState = useDataSources();
	const preview = usePreviewData(sourceId === "" ? null : { sourceId });

	const bindings = useMemo(
		() =>
			primaryId === undefined
				? []
				: Object.values(authoring.bindings).filter(
						(binding) => binding.nodeId === primaryId,
					),
		[authoring.bindings, primaryId],
	);

	const saveBinding = useCallback(
		async (input: {
			readonly target: BindingTarget;
			readonly dataPath: readonly string[];
		}): Promise<EditorCommandResult | null> => {
			if (primaryId === undefined) return null;
			const binding: Binding = {
				version: "1",
				id: crypto.randomUUID(),
				nodeId: primaryId,
				target: input.target,
				expression: {
					type: "path",
					root: "data",
					path: input.dataPath,
				},
			};
			const result = await commands.execute({
				id: crypto.randomUUID(),
				expectedRevision: revision,
				source: "inspector",
				timestamp: Date.now(),
				type: "binding.update",
				binding,
			});
			setLastErrors(
				result.status === "rejected"
					? result.errors.map((error) => error.message)
					: [],
			);
			return result;
		},
		[commands, revision, primaryId],
	);

	if (sourceState.status === "idle") return null;

	return {
		bindings,
		sources: sourceState.status === "ready" ? sourceState.sources : [],
		preview,
		saveBinding,
		lastErrors:
			sourceState.status === "failed"
				? [sourceState.message, ...lastErrors]
				: lastErrors,
	};
}
