"use client";

/**
 * @file `InteractionRuntimeMount` — runs interactions while previewing
 * (PLAN-0020 CORE-P3-002; ED-INT-001/002, ED-MOTION-001..003).
 *
 * Mounted inside `EditorRoot`, which lives in the canvas overlay and so
 * has the iframe document and the DOM registry available.
 *
 * Renders nothing. Its whole job is the effect: on entering preview it
 * binds triggers to real elements; on leaving it disposes the session,
 * which releases every listener, observer, timer and animation in one
 * call (§16).
 *
 * **Design mode is a no-op by construction** — the effect returns early
 * unless `interactionsEnabled(mode)`, which is the single place that
 * question is answered.
 */

import type { Interaction } from "@anvilkit/contracts/editor";
import { type ReactNode, use, useEffect, useSyncExternalStore } from "react";
import { EditorUiStoreContext } from "@/state/slices/EditorUiStoreProvider";
import { readDocument } from "../../../document-model/index.js";
import {
	interactionsEnabled,
	resolveInteractions,
} from "../../../editor/index.js";
import type { StudioEditorBridge } from "../bridge.js";
import { bindInteractions } from "./runtime.js";
import {
	usePrefersReducedMotion,
	usePreviewSession,
} from "./use-preview-mode.js";

/** Props for {@link InteractionRuntimeMount}. */
export interface InteractionRuntimeMountProps {
	readonly bridge: StudioEditorBridge;
}

/** Binds and runs interactions for the duration of preview mode. */
export function InteractionRuntimeMount({
	bridge,
}: InteractionRuntimeMountProps): ReactNode {
	// Read the UI store defensively rather than through
	// `useInteractionPreview`: `EditorRoot` is mounted in tests and in
	// host setups without the AnvilKit chrome, where the provider is
	// absent and the selector would throw. No chrome means no preview
	// toggle, so design mode is the correct degradation.
	const preview = useOptionalInteractionPreview();
	const reducedMotion = usePrefersReducedMotion();
	const mode = preview ? "preview" : "design";
	const session = usePreviewSession(mode);

	useEffect(() => {
		if (!interactionsEnabled(mode)) return;
		const registry = bridge.canvasRegistry;
		const doc = bridge.canvasDocument;
		const api = bridge.getPuckApi();
		if (registry == null || doc === null || api === null) return;

		// `p3-009`: interactions are a per-node §5.1 carrier, read from the
		// document through the canonical read model. The sidecar's flat
		// `authoring.interactions` map is gone, and with it the class of
		// bug where a node was removed but its interaction record was not.
		const model = readDocument(api.appState.data, api.config);
		const interactions: readonly Interaction[] = [...model.nodes.values()]
			.flatMap((node) => node.interactions ?? [])
			.filter((interaction): interaction is Interaction => interaction != null);
		if (interactions.length === 0) return;

		// A dangling reference disables an interaction; binding one would
		// fire actions at nodes that are not mounted.
		const runnable = resolveInteractions(
			Object.fromEntries(interactions.map((entry) => [entry.id, entry])),
			(nodeId) => registry.getPrimaryElement(nodeId) !== null,
		)
			.filter((resolved) => resolved.effectiveEnabled)
			.map((resolved) => resolved.interaction);

		const openPage = bridge.editorConfig?.pageAdapter?.open;
		bindInteractions(runnable, {
			session,
			doc,
			reducedMotion,
			getElement: (nodeId) => registry.getPrimaryElement(nodeId),
			getElements: (nodeId) => registry.getElements(nodeId),
			...(openPage === undefined
				? {}
				: {
						openPage: (pageId: string) => {
							void openPage(pageId);
						},
					}),
			// `onDiagnostic` is intentionally unbound: the bridge exposes
			// no logging channel, and inventing one here would be a new
			// cross-cutting surface decided by a preview detail. A refused
			// navigation is still *prevented* — only the notice is missing.
		});

		// The session owns teardown; `usePreviewSession` disposes it when
		// the mode changes or the component unmounts, so there is nothing
		// to unbind here by hand.
	}, [mode, session, bridge, reducedMotion]);

	return null;
}

/** `interactionPreview`, or `false` when the UI store is absent. */
function useOptionalInteractionPreview(): boolean {
	const storeApi = use(EditorUiStoreContext);
	return useSyncExternalStore(
		storeApi === null ? noopSubscribe : storeApi.subscribe,
		storeApi === null
			? alwaysDesign
			: () => storeApi.getState().interactionPreview,
		alwaysDesign,
	);
}

function noopSubscribe(): () => void {
	return noop;
}
function noop(): void {
	// No store: the value never changes.
}
function alwaysDesign(): boolean {
	return false;
}
