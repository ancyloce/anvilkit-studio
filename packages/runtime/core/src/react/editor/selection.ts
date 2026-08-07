"use client";

/**
 * @file The editor selection store and controller (PLAN-0020
 * CORE-P1A-002; DD-0019 §10.6, §22.3; DD-DEC-013/-017).
 *
 * Core owns the **full** multi-selection (`EditorSelectionState`);
 * only the primary id is synchronized to Puck's single-selection
 * (`setUi.itemSelector` — never a history-recording dispatch, so
 * selection never enters Puck history). Locked nodes are selectable —
 * mutation fencing happens at the command layer, not here. Scope
 * fencing: a selection can never span component editing scopes;
 * changing scope clears the selection (§10.6).
 *
 * Per-instance: created by the editor root per `<Studio>` mount (the
 * verified per-instance store rule — no module singletons). Built on
 * `zustand/vanilla` like every other Core state slice.
 */

import type { EditorSelectionState } from "@anvilkit/contracts/editor";
import { createStore } from "zustand/vanilla";

const EMPTY_SELECTION: EditorSelectionState = {
	selectedIds: [],
	definitionScope: "page",
	mode: "page",
};

/**
 * The public selection surface (DD-0019 §22.3, snapshot-gated).
 * Handed to chrome (Layers, canvas overlays, shortcuts) through
 * `useStudioEditor()` and to plugins through
 * `StudioPluginContext.editor` (read-only projection there).
 */
export interface EditorSelectionController {
	/** The current selection snapshot. */
	getState(): EditorSelectionState;
	/** Subscribe to selection changes. Returns an unsubscribe fn. */
	subscribe(listener: (state: EditorSelectionState) => void): () => void;
	/** Replace the selection with one node (primary + anchor). */
	select(nodeId: string): void;
	/**
	 * Toggle membership (shift/ctrl-click semantics). Toggling on makes
	 * the node primary; toggling the primary off promotes the last
	 * remaining id.
	 */
	toggle(nodeId: string): void;
	/**
	 * Range-select from the anchor to `nodeId` by visible tree order
	 * (provider installed by the Layers surface). Without a provider —
	 * or an anchor — this degrades to {@link select}.
	 */
	selectRange(nodeId: string): void;
	/** Replace the selection with an explicit set. */
	selectMany(nodeIds: readonly string[], primaryId?: string): void;
	/** Clear the selection (and Puck's, via primary sync). */
	clear(): void;
	/**
	 * Enter/exit a component editing scope. Always clears the
	 * selection — selections can never span scopes (§10.6).
	 */
	setDefinitionScope(
		definitionScope: EditorSelectionState["definitionScope"],
	): void;
	/**
	 * Switch editing granularity. **Never enters history** — there is
	 * nothing to undo, because the mode writes no document state.
	 */
	setMode(mode: EditorSelectionState["mode"]): void;
	/**
	 * Set the active style target. Cleared automatically when the
	 * primary selection moves to a type that does not declare it.
	 */
	setTargetId(targetId: string | undefined): void;
	/**
	 * The selected ids that actually declare the active `targetId` —
	 * the commit set.
	 *
	 * Multi-select in component mode means *the same target across
	 * several nodes*, and nodes that do not declare it are excluded
	 * **here, before dispatch**, rather than discovered afterwards
	 * through `updateAppearanceInData`'s
	 * `EDITOR_CAPABILITY_UNSUPPORTED` path. The inspector must never
	 * offer a control whose commit would be rejected.
	 */
	targetCommitSet(): readonly string[];
}

/** The controller plus internal seams the editor root wires up. */
export interface InternalEditorSelectionController
	extends EditorSelectionController {
	/**
	 * Puck→Core sync: called by the in-Puck binder whenever Puck's
	 * selected item changes. An id equal to the current primary is
	 * treated as the echo of our own primary sync and ignored, which
	 * also preserves multi-selections when Puck re-reports the primary.
	 */
	readonly handlePuckSelectedChange: (nodeId: string | null) => void;
	/**
	 * Install the visible-tree-order provider backing
	 * {@link EditorSelectionController.selectRange} (CORE-P1A-011).
	 */
	readonly setVisibleOrderProvider: (
		provider: (() => readonly string[]) | null,
	) => void;
	/**
	 * Declared-target lookup, installed by the editor root.
	 *
	 * The selection store stays standalone (`zustand/vanilla`, no new
	 * store, no document access) — it asks this seam which targets a
	 * node declares, exactly as it asks `setVisibleOrderProvider` for
	 * tree order. Without a provider the rules degrade to "no opinion"
	 * rather than to "nothing is capable".
	 */
	readonly setDeclaredTargetsProvider: (
		provider: ((nodeId: string) => readonly string[]) | null,
	) => void;
}

/** Dependencies of the selection controller. */
export interface SelectionControllerDeps {
	/**
	 * Core→Puck sync for the primary id (`setUi.itemSelector` — a
	 * non-history dispatch). Called only for Core-originated changes.
	 */
	readonly syncPrimaryToPuck: (nodeId: string | null) => void;
	/** Called after every selection change (bridge notification). */
	readonly onChange?: (state: EditorSelectionState) => void;
}

function dedupe(ids: readonly string[]): readonly string[] {
	return [...new Set(ids)];
}

/** Create the per-instance selection controller. */
export function createEditorSelectionController(
	deps: SelectionControllerDeps,
): InternalEditorSelectionController {
	const store = createStore<EditorSelectionState>(() => EMPTY_SELECTION);
	let visibleOrder: (() => readonly string[]) | null = null;
	let declaredTargets: ((nodeId: string) => readonly string[]) | null = null;

	/**
	 * Drop a `targetId` the new primary's component does not declare.
	 *
	 * Applied inside `commit` rather than at each call site **on
	 * purpose**: every selection path — `select`, `toggle`,
	 * `selectRange`, `selectMany`, the Puck→Core sync — funnels through
	 * here, so no path can forget the rule and leave a dangling address
	 * behind. Falling back to `undefined` means "the node's root
	 * target", which is always addressable.
	 */
	const resolveTarget = (next: EditorSelectionState): EditorSelectionState => {
		if (next.targetId === undefined || declaredTargets === null) return next;
		const primary = next.primaryId;
		if (primary !== undefined && declaredTargets(primary).includes(next.targetId)) {
			return next;
		}
		const { targetId: _dangling, ...rest } = next;
		return rest;
	};

	const commit = (
		candidate: EditorSelectionState,
		options?: { readonly skipPuckSync?: boolean },
	): void => {
		const next = resolveTarget(candidate);
		const prev = store.getState();
		if (prev === next) {
			return;
		}
		store.setState(next, true);
		if (options?.skipPuckSync !== true && prev.primaryId !== next.primaryId) {
			deps.syncPrimaryToPuck(next.primaryId ?? null);
		}
		deps.onChange?.(next);
	};

	const controller: InternalEditorSelectionController = {
		getState: () => store.getState(),
		subscribe: (listener) => store.subscribe(listener),

		select(nodeId) {
			const prev = store.getState();
			if (
				prev.primaryId === nodeId &&
				prev.selectedIds.length === 1 &&
				prev.selectedIds[0] === nodeId
			) {
				return;
			}
			commit({
				...prev,
				primaryId: nodeId,
				anchorId: nodeId,
				selectedIds: [nodeId],
			});
		},

		toggle(nodeId) {
			const prev = store.getState();
			if (prev.selectedIds.includes(nodeId)) {
				const selectedIds = prev.selectedIds.filter((id) => id !== nodeId);
				const primaryId =
					prev.primaryId === nodeId
						? selectedIds[selectedIds.length - 1]
						: prev.primaryId;
				const next: EditorSelectionState = {
					definitionScope: prev.definitionScope,
					mode: prev.mode,
					...(prev.targetId !== undefined ? { targetId: prev.targetId } : {}),
					selectedIds,
					...(primaryId !== undefined ? { primaryId } : {}),
					...(prev.anchorId !== undefined && prev.anchorId !== nodeId
						? { anchorId: prev.anchorId }
						: primaryId !== undefined
							? { anchorId: primaryId }
							: {}),
				};
				commit(next);
				return;
			}
			commit({
				definitionScope: prev.definitionScope,
				mode: prev.mode,
				...(prev.targetId !== undefined ? { targetId: prev.targetId } : {}),
				selectedIds: [...prev.selectedIds, nodeId],
				primaryId: nodeId,
				anchorId: prev.anchorId ?? nodeId,
			});
		},

		selectRange(nodeId) {
			const prev = store.getState();
			const order = visibleOrder?.();
			const anchor = prev.anchorId;
			if (order === undefined || anchor === undefined) {
				controller.select(nodeId);
				return;
			}
			const from = order.indexOf(anchor);
			const to = order.indexOf(nodeId);
			if (from === -1 || to === -1) {
				controller.select(nodeId);
				return;
			}
			const [start, end] = from <= to ? [from, to] : [to, from];
			commit({
				definitionScope: prev.definitionScope,
				mode: prev.mode,
				...(prev.targetId !== undefined ? { targetId: prev.targetId } : {}),
				selectedIds: order.slice(start, end + 1),
				primaryId: nodeId,
				anchorId: anchor,
			});
		},

		selectMany(nodeIds, primaryId) {
			const prev = store.getState();
			const selectedIds = dedupe(nodeIds);
			if (selectedIds.length === 0) {
				controller.clear();
				return;
			}
			const primary =
				primaryId !== undefined && selectedIds.includes(primaryId)
					? primaryId
					: selectedIds[0];
			commit({
				definitionScope: prev.definitionScope,
				mode: prev.mode,
				...(prev.targetId !== undefined ? { targetId: prev.targetId } : {}),
				selectedIds,
				...(primary !== undefined
					? { primaryId: primary, anchorId: primary }
					: {}),
			});
		},

		clear() {
			const prev = store.getState();
			if (prev.selectedIds.length === 0 && prev.primaryId === undefined) {
				return;
			}
			commit({
				definitionScope: prev.definitionScope,
				mode: prev.mode,
				selectedIds: [],
			});
		},

		setDefinitionScope(definitionScope) {
			const prev = store.getState();
			if (prev.definitionScope === definitionScope) {
				return;
			}
			// Selections never span scopes (§10.6): entering or leaving a
			// component scope always starts from an empty selection.
			commit({ definitionScope, mode: prev.mode, selectedIds: [] });
		},

		setMode(mode) {
			const prev = store.getState();
			if (prev.mode === mode) return;
			// Leaving component mode drops the target with it — a target
			// address is meaningless in page mode.
			commit(
				mode === "page"
					? { ...prev, mode, targetId: undefined }
					: { ...prev, mode },
			);
		},

		setTargetId(targetId) {
			const prev = store.getState();
			if (prev.targetId === targetId) return;
			commit({ ...prev, targetId });
		},

		handlePuckSelectedChange(nodeId) {
			const prev = store.getState();
			if (nodeId === null) {
				if (prev.selectedIds.length === 0 && prev.primaryId === undefined) {
					return;
				}
				commit(
					{
						definitionScope: prev.definitionScope,
						mode: prev.mode,
						selectedIds: [],
					},
					{ skipPuckSync: true },
				);
				return;
			}
			// Echo of our own primary sync (or a canvas click on the
			// current primary): keep the multi-selection intact.
			if (prev.primaryId === nodeId) {
				return;
			}
			commit(
				{
					definitionScope: prev.definitionScope,
					mode: prev.mode,
					...(prev.targetId !== undefined ? { targetId: prev.targetId } : {}),
					selectedIds: [nodeId],
					primaryId: nodeId,
					anchorId: nodeId,
				},
				{ skipPuckSync: true },
			);
		},

		setVisibleOrderProvider(provider) {
			visibleOrder = provider;
		},

		setDeclaredTargetsProvider(provider) {
			declaredTargets = provider;
		},

		targetCommitSet() {
			const state = store.getState();
			const targetId = state.targetId;
			if (targetId === undefined || declaredTargets === null) {
				return state.selectedIds;
			}
			return state.selectedIds.filter((id) =>
				declaredTargets?.(id).includes(targetId),
			);
		},
	};
	return controller;
}
