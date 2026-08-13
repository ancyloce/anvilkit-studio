"use client";

/**
 * @file `useComponentLibrary` — the live model behind the Components
 * panel (PLAN-0028 `p5-006`; DD-0019 §14.2–§14.6; ED-COMP-002/-005/
 * -006/-007).
 *
 * The panel is the document-local component *library*: every
 * definition the document declares, how many live instances each has,
 * and the lifecycle actions §14.6 requires — insert another instance,
 * enter isolated editing, rename, and delete under the host's deletion
 * policy.
 *
 * ### What `p5-006` changed
 *
 * Reads were `port.getSnapshot().authoring.componentDefinitions` and
 * `…authoring.nodes[id].componentInstance` — the sidecar, which
 * carrier documents never populate, so on a `p3-001`-era document this
 * panel listed nothing that was genuinely stored (report 0021 §6, one
 * layer up). They are now `p2-004`'s projection: `componentLibrary`
 * comes from the declared `root.props.componentLibrary` root prop and
 * each instance from its own node's declared prop.
 *
 * Writes were `port.execute` / `port.commitNative` against the sidecar
 * reducer. They are now the shipped carrier commits —
 * `commitComponentLibraryUpdate` (`p3-001`),
 * `commitDetachAllAndDeleteDefinition` (`p3-003`) and
 * `commitInsertNode` (`p3-005`) — each of which is exactly one
 * history-recording functional `setData`, so every action below is one
 * undo step (§10.5).
 *
 * ### Puck contract
 *
 * Rule 2: definitions live in the declared root prop; the instance
 * carrier this hook inserts lives on the instance node's own props.
 * Rule 3: the same `Data` the compiler, `<Render>` and export read.
 * There is no sidecar, no companion map, and no id registry.
 */

import type {
	ComponentDefinition,
	ComponentDefinitionDeletePolicy,
	EditorError,
} from "@anvilkit/contracts/editor";
import { use, useCallback, useMemo } from "react";
import { writeComponentInstanceProp } from "../../../document-model/materialize.js";
import { COMPONENT_FRAME_TYPE } from "../../../puck/create-component.js";
import type { ComponentLibraryEdit } from "../../../puck/update-component-library.js";
import { commitComponentLibraryUpdate } from "../../../puck/update-component-library.js";
import { commitDetachAllAndDeleteDefinition } from "../../../puck/update-instance-overrides.js";
import { commitInsertNode } from "../../../puck/update-tree.js";
import { useShellSelection } from "../composition/use-shell-selection.js";
import { useOptionalDocumentModel } from "../use-document-model.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import {
	useComponentEditorRuntime,
	usePuckApiGetter,
} from "./editor-runtime.js";
import { scopedDefinitionId } from "./scope.js";
import { randomId } from "@/shared/node-id";

/** Referencing node ids carried on a row, capped like the diagnostics. */
const INSTANCE_ID_REPORT_CAP = 50;

/** One row in the Components panel. */
export interface ComponentLibraryEntry {
	readonly definition: ComponentDefinition;
	/** Live page-scope instances referencing this definition. */
	readonly instanceCount: number;
	/** Referencing node ids (capped at 50, matching §14.6's report cap). */
	readonly instanceNodeIds: readonly string[];
	/** Declared axes × options; `0` when the component has no axes. */
	readonly combinationCount: number;
}

/** Outcome of a definition delete attempt. */
export interface DeleteDefinitionOutcome {
	readonly status: "committed" | "rejected" | "noop";
	readonly errors: readonly EditorError[];
}

/** Outcome of a definition rename. */
export interface RenameDefinitionOutcome {
	readonly status: "committed" | "rejected" | "noop";
	readonly errors: readonly EditorError[];
}

/** The Components panel model. */
export interface ComponentLibrary {
	readonly entries: readonly ComponentLibraryEntry[];
	/** The definition currently open in isolated editing, if any. */
	readonly activeDefinitionId: string | undefined;
	/** True while writers are available (not read-only, not gated). */
	readonly canMutate: boolean;
	/** The host's deletion policy — decides the delete dialog's shape. */
	readonly deletePolicy: ComponentDefinitionDeletePolicy;
	/** Open a definition for isolated editing (no history entry). */
	readonly enterComponent: (definitionId: string) => void;
	/** Leave isolated editing, restoring the previous page selection. */
	readonly exitComponent: () => void;
	/**
	 * Insert another instance of a definition at the end of the page
	 * root, and select it. One history-recording dispatch.
	 */
	readonly insertInstance: (definitionId: string) => {
		readonly status: string;
		readonly instanceNodeId?: string;
	};
	/** Rename a definition (one dispatch). */
	readonly rename: (
		definitionId: string,
		name: string,
	) => RenameDefinitionOutcome | null;
	/**
	 * Delete a definition. `detachAll` first materializes every
	 * instance, so the two land in ONE `Data` — a cancelled dialog
	 * leaves the document untouched, and a confirmed
	 * detach-all-and-delete is a single undo step (§14.6).
	 */
	readonly deleteDefinition: (
		definitionId: string,
		options?: { readonly detachAll?: boolean },
	) => DeleteDefinitionOutcome;
}

const NO_ENTRIES: readonly ComponentLibraryEntry[] = Object.freeze([]);
const NO_ERRORS: readonly EditorError[] = Object.freeze([]);
/** What every write returns when there is no live `PuckApi` to hit. */
const NO_API: DeleteDefinitionOutcome = Object.freeze({
	status: "rejected",
	errors: NO_ERRORS,
});

/** Declared axes × options; `0` when the component declares no axes. */
function combinationsOf(definition: ComponentDefinition): number {
	return definition.variantAxes.reduce(
		(total, axis) => total * Math.max(axis.options.length, 1),
		definition.variantAxes.length === 0 ? 0 : 1,
	);
}

/**
 * The live component library.
 *
 * Never `null` — the panel renders an empty state rather than
 * disappearing, and a document with no definitions is a legitimate
 * state rather than an absent surface. Outside `<Puck>` the library is
 * empty and every write refuses, rather than the panel crashing the
 * chrome around it.
 */
export function useComponentLibrary(): ComponentLibrary {
	const model = useOptionalDocumentModel();
	const selection = useShellSelection();
	const runtime = useComponentEditorRuntime();
	const getPuckApi = usePuckApiGetter();
	// Policy is host configuration, not document state, so it is the one
	// thing still read off the bridge.
	const bridge = use(StudioEditorBridgeContext);
	const deletePolicy: ComponentDefinitionDeletePolicy =
		bridge?.editorConfig?.policies?.componentDefinitionDelete ??
		"confirm-detach-all";

	/**
	 * `p3-001`'s definition commit, bound to whichever `PuckApi` is
	 * reachable. This is `useComponentLibraryCommit` with a null guard —
	 * the same pure `commitComponentLibraryUpdate`, not a second write
	 * path — because that hook binds `useGetPuck` unconditionally and
	 * this surface must also survive being rendered outside the provider.
	 */
	const commitLibrary = useCallback(
		(edit: ComponentLibraryEdit) => {
			const api = getPuckApi();
			return api === null
				? NO_API
				: commitComponentLibraryUpdate({ getPuckApi: () => api }, edit);
		},
		[getPuckApi],
	);

	const entries = useMemo((): readonly ComponentLibraryEntry[] => {
		const definitions = model?.componentLibrary?.definitions;
		if (model === null || definitions === undefined) {
			return NO_ENTRIES;
		}
		// Instance counts in ONE pass over the projected nodes rather than
		// a scan per definition: the panel renders every definition, so
		// per-definition scans would be quadratic on a component-heavy
		// document.
		const counts = new Map<string, { total: number; ids: string[] }>();
		for (const [nodeId, node] of model.nodes) {
			const definitionId = node.componentInstance?.definitionId;
			if (definitionId === undefined) continue;
			const bucket = counts.get(definitionId);
			if (bucket === undefined) {
				counts.set(definitionId, { total: 1, ids: [nodeId] });
				continue;
			}
			bucket.total += 1;
			// Past the report cap the ids stop accumulating but the count
			// keeps rising, so the two are tracked separately.
			if (bucket.ids.length < INSTANCE_ID_REPORT_CAP) bucket.ids.push(nodeId);
		}
		return (
			Object.values(definitions)
				.map((definition) => {
					const bucket = counts.get(definition.id);
					return {
						definition,
						instanceCount: bucket?.total ?? 0,
						instanceNodeIds: bucket?.ids ?? [],
						combinationCount: combinationsOf(definition),
					};
				})
				// Stable, human order: by name then id, so the list does not
				// reshuffle when an unrelated definition is edited.
				.sort(
					(a, b) =>
						a.definition.name.localeCompare(b.definition.name) ||
						a.definition.id.localeCompare(b.definition.id),
				)
		);
	}, [model]);

	/**
	 * Insert another instance at the end of the page root.
	 *
	 * The node carries the definition link in its **own declared prop**
	 * (`writeComponentInstanceProp`), which is why an insert is an
	 * ordinary tree write rather than a component-specific command: the
	 * instance is a normal Puck node whose props happen to say what it
	 * is an instance of (contract rule 2).
	 */
	const insertInstance = useCallback(
		(definitionId: string) => {
			const definition = model?.componentLibrary?.definitions[definitionId];
			const api = getPuckApi();
			if (definition === undefined || api === null) {
				return { status: "rejected" };
			}
			const instanceNodeId = randomId();
			const result = commitInsertNode(
				{ getPuckApi: () => api },
				{
					// The definition's own root type, so the inserted node
					// renders as the thing it is an instance of. A multi-node
					// capture is rooted at the editor-owned frame type, which is
					// exactly what the capture itself inserted.
					type: definition.root.type || COMPONENT_FRAME_TYPE,
					nodeId: instanceNodeId,
					props: writeComponentInstanceProp(
						{},
						{
							definitionId,
							definitionRevision: definition.revision,
							variantSelection: {},
							propOverrides: {},
							nodeOverrides: {},
						},
					),
				},
			);
			if (result.status === "committed") {
				// Freeze §7 selection mapping: the new instance is selected.
				runtime.select(instanceNodeId);
				return { status: "committed", instanceNodeId };
			}
			return { status: result.status };
		},
		[model, getPuckApi, runtime],
	);

	const rename = useCallback(
		(definitionId: string, name: string): RenameDefinitionOutcome | null => {
			const trimmed = name.trim();
			if (trimmed.length === 0) return null;
			const result = commitLibrary({
				kind: "update",
				definitionId,
				update: (current) => ({ ...current, name: trimmed }),
			});
			return { status: result.status, errors: result.errors };
		},
		[commitLibrary],
	);

	/**
	 * Delete a definition, optionally detaching every instance first.
	 *
	 * Both shapes are ONE history entry. A plain delete is
	 * `commitComponentLibraryUpdate`, which **refuses** while the
	 * definition is referenced — that refusal is what the dialog turns
	 * into an explicit choice. Detach-all routes through
	 * `commitDetachAllAndDeleteDefinition`, which materializes every
	 * instance and drops the definition in the same `Data`, so one undo
	 * restores the definition *and* every instance's reference (§14.6)
	 * and a failure part-way commits nothing.
	 */
	const deleteDefinition = useCallback(
		(
			definitionId: string,
			options?: { readonly detachAll?: boolean },
		): DeleteDefinitionOutcome => {
			if (options?.detachAll !== true) {
				const result = commitLibrary({
					kind: "delete",
					definitionId,
					policy: deletePolicy,
				});
				return { status: result.status, errors: result.errors };
			}
			const api = getPuckApi();
			if (api === null) return NO_API;
			const result = commitDetachAllAndDeleteDefinition(
				{ getPuckApi: () => api },
				definitionId,
				() => randomId(),
			);
			return { status: result.status, errors: result.errors };
		},
		[commitLibrary, deletePolicy, getPuckApi],
	);

	return useMemo(
		() => ({
			entries,
			activeDefinitionId: scopedDefinitionId(selection.definitionScope),
			canMutate: runtime.canMutate,
			deletePolicy,
			enterComponent: runtime.enterComponent,
			exitComponent: runtime.exitComponent,
			insertInstance,
			rename,
			deleteDefinition,
		}),
		[
			entries,
			selection.definitionScope,
			runtime,
			deletePolicy,
			insertInstance,
			rename,
			deleteDefinition,
		],
	);
}
