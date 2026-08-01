"use client";

/**
 * @file `useComponentLibrary` — the live model behind the Components
 * panel (PLAN-0020 CORE-P2-009F/G/H; ED-COMP-002/-005/-006/-007;
 * DD-0019 §14.2–§14.5).
 *
 * The panel is the document-local component *library*: every
 * definition the sidecar holds, how many live instances each has, and
 * the lifecycle actions §14.5 requires — insert another instance,
 * enter isolated editing, rename, and delete under the host's
 * deletion policy.
 *
 * Every mutation goes through the same typed port the rest of the
 * editor uses, and each user intent commits as exactly one
 * history-recording dispatch (§10.5). Nothing here keeps its own copy
 * of authoring state: the hook derives from `port.getSnapshot()` on
 * each bridge notification, so undo/redo and foreign edits are
 * reflected without a second source of truth.
 *
 * Entry-chunk safe: the engine loads through a dynamic `import()`
 * inside each handler, matching `useCreateComponent`.
 */

import type {
	ComponentDefinitionV1,
	EditorCommandResult,
	EditorError,
} from "@anvilkit/contracts/editor";
import { use, useCallback, useMemo, useSyncExternalStore } from "react";
import type { InternalEditorCommandPort } from "../command-port.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import { createEditorScopeController, scopedDefinitionId } from "./scope.js";

/** One row in the Components panel. */
export interface ComponentLibraryEntry {
	readonly definition: ComponentDefinitionV1;
	/** Live page-scope instances referencing this definition. */
	readonly instanceCount: number;
	/** Referencing node ids (capped by the engine at 50). */
	readonly instanceNodeIds: readonly string[];
	/** Declared axes × options; `0` when the component has no axes. */
	readonly combinationCount: number;
}

/** Outcome of a definition delete attempt. */
export interface DeleteDefinitionOutcome {
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
	readonly deletePolicy: "confirm-detach-all" | "block-when-referenced";
	/** Open a definition for isolated editing (no history entry). */
	readonly enterComponent: (definitionId: string) => void;
	/** Leave isolated editing, restoring the previous page selection. */
	readonly exitComponent: () => void;
	/**
	 * Insert another instance of a definition at the end of the page
	 * root, and select it. One history-recording dispatch.
	 */
	readonly insertInstance: (
		definitionId: string,
	) => Promise<{ status: string; instanceNodeId?: string }>;
	/** Rename a definition (one dispatch). */
	readonly rename: (
		definitionId: string,
		name: string,
	) => Promise<EditorCommandResult | null>;
	/**
	 * Delete a definition. `detachAll` first materializes every
	 * instance, so the two land in ONE atomic batch — a cancelled
	 * dialog leaves the document untouched, and a confirmed
	 * detach-all-and-delete is a single undo step (§14.5).
	 */
	readonly deleteDefinition: (
		definitionId: string,
		options?: { readonly detachAll?: boolean },
	) => Promise<DeleteDefinitionOutcome>;
}

/**
 * The live component library, or `null` when the editor runtime is
 * off or still loading.
 */
export function useComponentLibrary(): ComponentLibrary | null {
	const bridge = use(StudioEditorBridgeContext);
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);

	const port = bridge?.port as InternalEditorCommandPort | null | undefined;
	const selection = bridge?.selection;

	const scopeController = useMemo(
		() =>
			selection == null
				? null
				: createEditorScopeController({
						getSelection: () => selection.getState(),
						setScope: (scope) => selection.setScope(scope),
						selectMany: (nodeIds) => selection.selectMany(nodeIds),
					}),
		[selection],
	);

	const entries = useMemo((): readonly ComponentLibraryEntry[] => {
		void version;
		if (port == null) {
			return [];
		}
		const authoring = port.getSnapshot().authoring;
		// Instance counts in one pass over the node records rather than
		// `countLiveInstances` per definition: the panel renders every
		// definition, so per-definition scans would be quadratic on a
		// document with many components.
		const counts = new Map<string, string[]>();
		for (const [nodeId, record] of Object.entries(authoring.nodes)) {
			const definitionId = record.componentInstance?.definitionId;
			if (definitionId === undefined) continue;
			const list = counts.get(definitionId);
			if (list === undefined) {
				counts.set(definitionId, [nodeId]);
			} else if (list.length < 50) {
				list.push(nodeId);
			} else {
				// Past the report cap the ids stop accumulating but the
				// count must keep rising, so track it out of band.
				list.push("");
			}
		}
		return (
			Object.values(authoring.componentDefinitions)
				.map((definition) => {
					const ids = counts.get(definition.id) ?? [];
					return {
						definition,
						instanceCount: ids.length,
						instanceNodeIds: ids.filter((id) => id.length > 0),
						combinationCount: definition.variantAxes.reduce(
							(total, axis) => total * Math.max(axis.options.length, 1),
							definition.variantAxes.length === 0 ? 0 : 1,
						),
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
	}, [port, version]);

	const insertInstance = useCallback(
		async (
			definitionId: string,
		): Promise<{ status: string; instanceNodeId?: string }> => {
			if (bridge == null || port == null) {
				return { status: "rejected" };
			}
			const { buildInsertInstancePlan } = await import(
				"../../../editor/index.js"
			);
			const instanceNodeId = crypto.randomUUID();
			const result = port.commitNative((data, authoring) => {
				const plan = buildInsertInstancePlan(data, authoring, {
					definitionId,
					instanceNodeId,
				});
				return plan === null
					? null
					: { data: plan.data, authoring: plan.authoring };
			});
			if (result === "committed") {
				bridge.selection?.select(instanceNodeId);
				return { status: "committed", instanceNodeId };
			}
			return { status: result };
		},
		[bridge, port],
	);

	const rename = useCallback(
		async (
			definitionId: string,
			name: string,
		): Promise<EditorCommandResult | null> => {
			if (port == null) return null;
			const trimmed = name.trim();
			if (trimmed.length === 0) return null;
			// A rename is a definition edit, and definition edits require
			// the component's own scope (freeze §6) — so enter it for the
			// duration of the dispatch rather than asking the user to.
			const previousScope = port.getSnapshot().selection.scope;
			const needsScope =
				scopedDefinitionId(previousScope) !== definitionId &&
				scopeController !== null;
			if (needsScope) {
				scopeController?.enterComponent(definitionId);
			}
			try {
				return await port.execute({
					id: crypto.randomUUID(),
					expectedRevision: port.getSnapshot().revision,
					source: "ui",
					timestamp: Date.now(),
					type: "component.definition.update",
					definitionId,
					patch: { name: trimmed } as never,
				});
			} finally {
				if (needsScope) {
					scopeController?.exitScope();
				}
			}
		},
		[port, scopeController],
	);

	const deleteDefinition = useCallback(
		async (
			definitionId: string,
			options?: { readonly detachAll?: boolean },
		): Promise<DeleteDefinitionOutcome> => {
			if (port == null) {
				return { status: "rejected", errors: [] };
			}
			const revision = port.getSnapshot().revision;
			const base = {
				expectedRevision: revision,
				source: "ui" as const,
				timestamp: Date.now(),
			};
			// Detach-all + delete as ONE batch: all-or-nothing, so a
			// rejected delete cannot leave the document with every
			// instance detached and the definition still present (§14.5).
			const command =
				options?.detachAll === true
					? {
							...base,
							id: crypto.randomUUID(),
							type: "batch" as const,
							commands: [
								{
									...base,
									id: crypto.randomUUID(),
									type: "component.definition.detachAll" as const,
									definitionId,
								},
								{
									...base,
									id: crypto.randomUUID(),
									type: "component.definition.delete" as const,
									definitionId,
								},
							],
						}
					: {
							...base,
							id: crypto.randomUUID(),
							type: "component.definition.delete" as const,
							definitionId,
						};
			const result = await port.execute(command as never);
			return {
				status: result.status === "committed" ? "committed" : "rejected",
				errors: result.errors,
			};
		},
		[port],
	);

	return useMemo(() => {
		void version;
		if (bridge == null || port == null || scopeController === null) {
			return null;
		}
		const canMutate = !port.isReadOnly() && !port.writersDisabled();
		return {
			entries,
			activeDefinitionId: scopedDefinitionId(
				port.getSnapshot().selection.scope,
			),
			canMutate,
			deletePolicy:
				bridge.editorConfig?.policies?.componentDefinitionDelete ??
				"confirm-detach-all",
			enterComponent: (definitionId) =>
				scopeController.enterComponent(definitionId),
			exitComponent: () => scopeController.exitScope(),
			insertInstance,
			rename,
			deleteDefinition,
		};
	}, [
		bridge,
		port,
		entries,
		scopeController,
		insertInstance,
		rename,
		deleteDefinition,
		version,
	]);
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
