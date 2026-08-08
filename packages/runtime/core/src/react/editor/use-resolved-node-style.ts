"use client";

/**
 * @file `useResolvedNodeStyle` — the public per-node resolved-style
 * hook (PLAN-0020 CORE-P1A-005; DD-0019 §22.3, snapshot-gated).
 *
 * Resolves one node's authoring through the single shared
 * materialization pipeline (CORE-P0-018): token substitution →
 * responsive resolution at the live viewport width → the allowlisted
 * CSS serializer. Subscribes to the editor bridge with
 * selector-style granularity — recomputation happens only when the
 * bridge version changes (commit, undo/redo, foreign write) or the
 * inputs change, and the memoized result keeps render identity
 * stable between changes.
 *
 * Returns `undefined` outside an editor-enabled `<Studio>`, while the
 * editor chunk loads, or when `nodeId` is `undefined` — callers can
 * treat "no resolved style" and "editor off" identically.
 */

import { use, useMemo, useSyncExternalStore } from "react";
import {
	type ResolvedAuthoringStyle,
	resolveAuthoringStyle,
	resolveTargetAppearance,
} from "../../editor/index.js";
import { readDocument } from "../../document-model/index.js";
import { ROOT_STYLE_TARGET_ID } from "../../puck/targets.js";
import { useOptionalReactivePuck } from "../utils/use-reactive-puck.js";
import { StudioEditorBridgeContext } from "./use-studio-editor.js";

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_TOKEN_MODE = "default";

/** Resolve one node's materialized authoring style reactively. */
export function useResolvedNodeStyle(
	nodeId: string | undefined,
): ResolvedAuthoringStyle | undefined {
	const bridge = use(StudioEditorBridgeContext);
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);
	const puckConfig = useOptionalReactivePuck((state) => state.config, null);
	const puckData = useOptionalReactivePuck(
		(state) => state.appState.data,
		null,
	);
	const model = useMemo(
		() =>
			puckConfig === null || puckData === null
				? null
				: readDocument(puckData, puckConfig),
		[puckConfig, puckData],
	);
	return useMemo(() => {
		void version;
		if (bridge == null || nodeId === undefined) {
			return undefined;
		}
		// Ported off the sidecar by `p2-007`: appearance and the design
		// system are read from the canonical document model, so this hook
		// and the compiler resolve the same node from the same `Data`
		// through the same cascade. Outside a `<Puck>` provider the model
		// is unavailable and the hook reports no style rather than
		// inventing one.
		const node = model?.nodes.get(nodeId);
		if (model == null) {
			return undefined;
		}
		const resolved = resolveTargetAppearance(
			node?.appearance?.targets?.[ROOT_STYLE_TARGET_ID],
			{
				designSystem: model.designSystem ?? {
					styleDefinitions: {},
					tokens: {},
					tokenModes: {},
				},
				breakpoints: model.designSystem?.breakpoints ?? [],
				viewportWidth:
					bridge.responsive?.getViewportWidth() ?? DEFAULT_VIEWPORT_WIDTH,
				tokenMode: DEFAULT_TOKEN_MODE,
			},
		);
		return resolveAuthoringStyle({
			nodeId,
			layout: resolved.layout,
			style: resolved.style,
			typography: resolved.typography,
			hidden: resolved.hidden,
		});
	}, [bridge, nodeId, version, model]);
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
