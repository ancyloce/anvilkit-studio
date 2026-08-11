"use client";

/**
 * @file The one place the component surfaces reach the editor
 * *runtime* rather than the document (PLAN-0028 `p5-006`).
 *
 * After the `p5-006` rebase every component hook reads the document
 * through {@link useDocumentModel} and writes through the `p3-001`…
 * `p3-003` commit helpers. Two things are still genuinely runtime
 * state rather than document state, and both live here so there is
 * exactly one file to change when `p3-009` deletes the command port:
 *
 * 1. **The write gate.** The collab writer gate is an editor-runtime
 *    fact, not a carrier — nothing in `Data` says "this session may
 *    not write". Dropping it would let a collab-gated session render
 *    enabled affordances whose commits reject.
 *
 *    `p3-009` narrowed this from two conditions to one. The other was
 *    the sidecar's read-only safe mode (`unsupported-major` envelope →
 *    refuse every write), which no longer exists: there is no sidecar
 *    to fail to parse, so there is no document a canonical session
 *    cannot write. The gate itself moved from the deleted command
 *    port onto `StudioEditorBridge.getWriterGateError`, and — this is
 *    the part that matters — it is now ENFORCED inside the commit
 *    helpers (`puck/writer-gate.ts`), so this hook disables the
 *    affordance while the write path independently refuses it.
 * 2. **Scope and selection.** `definitionScope` and the selected node
 *    set are editor pointers (freeze §6, §10.6): they never enter
 *    `Data` and never record history. Reads come from
 *    {@link useShellSelection}; only the *writes* need the controller.
 *
 * Degrades rather than throwing. Under a bare `<Puck>` with no editor
 * bridge there is no gate to consult and no controller to drive, so
 * the surface is writable and the navigation actions are no-ops —
 * the same "works without the bridge" contract the composition shell
 * states for itself.
 */

import type { PuckApi } from "@puckeditor/core";
import { useGetPuck } from "@puckeditor/core";
import { use, useCallback, useMemo, useSyncExternalStore } from "react";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import { getEditorScopeController } from "./scope.js";

/** The runtime facts a component surface needs beyond the document. */
export interface ComponentEditorRuntime {
	/** False when the document is read-only or the collab gate is shut. */
	readonly canMutate: boolean;
	/** Open a definition for isolated editing (no history entry). */
	readonly enterComponent: (definitionId: string) => void;
	/** Leave isolated editing, restoring the previous page selection. */
	readonly exitComponent: () => void;
	/** Move the editor selection to one node (freeze §7 mapping). */
	readonly select: (nodeId: string) => void;
}

const NOOP_RUNTIME: ComponentEditorRuntime = Object.freeze({
	canMutate: true,
	enterComponent: noop,
	exitComponent: noop,
	select: noop,
});

/**
 * The write gate plus the scope/selection actions, bound to the
 * enclosing `<Studio>`'s editor bridge.
 */
export function useComponentEditorRuntime(): ComponentEditorRuntime {
	const bridge = use(StudioEditorBridgeContext);
	// The gate flips on collab capability changes and on a foreign
	// read-only transition, both of which bump the bridge version.
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);
	const selection = bridge?.selection ?? null;

	return useMemo((): ComponentEditorRuntime => {
		void version;
		if (bridge === null) return NOOP_RUNTIME;
		const scope =
			selection === null ? null : getEditorScopeController(selection);
		return {
			// An un-installed gate reads as open, so affordances do not
			// flicker disabled while the lazy runtime loads — and a commit
			// issued in that window consults the same inert gate, so the
			// two agree by construction.
			canMutate: bridge.getWriterGateError() === null,
			enterComponent: (definitionId) => scope?.enterComponent(definitionId),
			exitComponent: () => scope?.exitScope(),
			select: (nodeId) => selection?.select(nodeId),
		};
	}, [bridge, selection, version]);
}

/**
 * A `PuckApi` getter that works on **both** sides of the provider.
 *
 * Every component *panel* renders inside `<Puck>` and could use
 * `useGetPuck` directly. One surface cannot:
 * `StudioEditorMount` WRAPS `<Puck>` (`react/components/Studio.tsx:360`),
 * so `CreateComponentDialog` — which `EditorRoot` mounts in the main
 * document precisely because the toolbar that triggers it lives inside
 * the canvas iframe — renders *outside* the provider. It reaches Puck
 * through the bridge's `getPuckApi()` seam (`p3-009`; formerly the
 * command port's `tryGetPuckApi()`), while every other caller stays on
 * the provider.
 *
 * Returns `null` rather than throwing when neither source is
 * available, so a caller refuses an edit instead of crashing the
 * chrome. The try/catch around `useGetPuck` is the same sanctioned
 * pattern as `useOptionalReactivePuck`: Puck's hook calls `useContext`
 * first and throws before any further hook, and a component instance
 * cannot gain or lose the provider without remounting, so hook order
 * is stable in both environments.
 */
export function usePuckApiGetter(): () => PuckApi | null {
	const bridge = use(StudioEditorBridgeContext);
	let getPuck: (() => PuckApi) | null = null;
	try {
		// biome-ignore lint/correctness/useHookAtTopLevel: Puck's useGetPuck throws from useContext (its first hook) when no provider exists, and a component instance can never gain/lose the provider without remounting — hook order is stable in both environments (see the doc above).
		getPuck = useGetPuck() as unknown as () => PuckApi;
	} catch {
		getPuck = null;
	}
	return useCallback((): PuckApi | null => {
		if (getPuck !== null) {
			try {
				return getPuck();
			} catch {
				// The provider exists but the store is mid-teardown.
				return null;
			}
		}
		return bridge?.getPuckApi() ?? null;
	}, [getPuck, bridge]);
}

function noopSubscribe(): () => void {
	return noop;
}
function noop(): void {
	// The no-bridge runtime has nothing to notify and nothing to drive.
}
function zero(): number {
	return 0;
}
