"use client";

/**
 * @file Inspector hooks (PLAN-0020 CORE-P1A-005): the shared
 * read/commit surface every universal section control builds on.
 *
 * `useEditorInspector()` snapshots the live editor state (authoring,
 * selection, breakpoints, active write layer) and partitions the
 * selection by capability per family. `useInspectorField()` computes
 * one property's {@link InspectorFieldState} and returns commit/reset
 * callbacks that write **through the command port only** — one
 * history-recording dispatch per intent, `source: "inspector"`,
 * `null` patches for reset-at-layer (freeze D-8). Invalid drafts stay
 * in the controls (§11.3) and never reach these commit paths.
 */

import type {
	BreakpointDefinition,
	EditorPatch,
	EditorSelectionState,
	ResponsiveLayerRef,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
	EditorCommandPort,
	EditorCommandResult,
} from "../../../editor/legacy/index.js";
import { use, useCallback, useMemo, useSyncExternalStore } from "react";
import {
	AUTHORABLE_PROPERTY_LOCATIONS,
	resolveStyleTargetsFor,
} from "../../../puck/component-metadata.js";
import { readDocument } from "../../../document-model/index.js";
import { useOptionalReactivePuck } from "../../overrides/utils/use-reactive-puck.js";
import { ROOT_STYLE_TARGET_ID } from "../../../puck/targets.js";
import type { StudioEditorBridge } from "../bridge.js";
import { withBreakpointMaterialization } from "../responsive/materialize.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import {
	type InspectorFamily,
	type InspectorFieldState,
	readFieldState,
} from "./field-state.js";

/** Fallback viewport width while the responsive store is absent. */
const DEFAULT_VIEWPORT_WIDTH = 1280;

const FAMILY_COMMAND_TYPE = {
	layout: "node.layout.set",
	style: "node.style.set",
	typography: "node.typography.set",
} as const;

/** What a section control needs from the live editor. */
export interface EditorInspectorContext {
	readonly bridge: StudioEditorBridge;
	readonly commands: EditorCommandPort;
	readonly authoring: AuthoringStateV1;
	readonly revision: number;
	readonly selection: EditorSelectionState;
	readonly breakpoints: readonly BreakpointDefinition[];
	/** The active write layer (base until CORE-P1A-008 installs). */
	readonly layer: ResponsiveLayerRef;
	readonly viewportWidth: number;
	/**
	 * Selected node ids whose component grants `family` **on
	 * `targetId`** (the node's root target when omitted).
	 *
	 * Per **target**, not per node: a component may declare `root` with
	 * layout properties and `cardTitle` with typography only, and the
	 * inspector must reflect that rather than answering one question for
	 * the whole node. This is the read-side precondition for `p5-003`'s
	 * target-scoped Style tab.
	 */
	readonly capableNodeIds: (
		family: InspectorFamily,
		targetId?: string,
	) => readonly string[];
}

/**
 * Live inspector context, or `null` while the editor runtime is
 * loading or nothing is selected. Subscribes to the bridge, so
 * consumers re-render on commits, undo/redo, and selection changes.
 */
export function useEditorInspector(): EditorInspectorContext | null {
	const bridge = use(StudioEditorBridgeContext);
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);
	// Capability gating reads the canonical document model. Selectors are
	// the OPTIONAL variant because inspector specs mount these hooks
	// without a `<Puck>` provider; outside it the model is `null` and
	// every node gates closed, which is the honest answer — the host may
	// not fabricate support it cannot verify.
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
		const port = bridge?.port;
		if (bridge == null || port == null) {
			return null;
		}
		const snapshot = port.getSnapshot();
		if (snapshot.selection.selectedIds.length === 0) {
			return null;
		}
		const capabilityCache = new Map<string, readonly string[]>();
		const capableNodeIds = (
			family: InspectorFamily,
			targetId: string = ROOT_STYLE_TARGET_ID,
		): readonly string[] => {
			const cacheKey = `${family}\u0000${targetId}`;
			const cached = capabilityCache.get(cacheKey);
			if (cached !== undefined) {
				return cached;
			}
			// The inspector family names differ from the spec family
			// names for the visual family only (`style` vs `visual`).
			const specFamily = family === "style" ? "visual" : family;
			const ids = snapshot.selection.selectedIds.filter((nodeId) => {
				// Gating reads the component's DECLARED style targets,
				// resolved by the one canonical reader and cached per
				// component type — the same `resolveStyleTargets` +
				// `AUTHORABLE_PROPERTY_LOCATIONS` pair the compiler
				// enforces, so the panel structurally cannot offer what
				// the compiler would drop. There is no capability
				// registry and no boolean flag in this path.
				// Declared targets come from the canonical read model when
				// the React `<Puck>` provider is reachable. When it is not
				// — the bare mounts inspector specs use, and only those —
				// they come from the same canonical reader via the
				// bridge's metadata lookup. Both paths validate through
				// ONE resolution (`resolveStyleTargetsFor`), so neither
				// can trust a malformed declaration the compiler would
				// reject. The fallback retires with the bridge in P3/P4.
				const declared =
					model?.nodes.get(nodeId)?.styleTargets ??
					resolveStyleTargetsFor(bridge.capabilities?.forNode(nodeId));
				const target = declared.find((entry) => entry.id === targetId);
				if (target === undefined) {
					return false;
				}
				return target.properties.some(
					(property) =>
						AUTHORABLE_PROPERTY_LOCATIONS[property]?.family === specFamily,
				);
			});
			capabilityCache.set(cacheKey, ids);
			return ids;
		};
		return {
			bridge,
			commands: port,
			authoring: snapshot.authoring,
			revision: snapshot.revision,
			selection: snapshot.selection,
			breakpoints: snapshot.breakpoints,
			layer: bridge.responsive?.getActiveLayer() ?? "base",
			viewportWidth:
				bridge.responsive?.getViewportWidth() ?? DEFAULT_VIEWPORT_WIDTH,
			capableNodeIds,
		};
	}, [bridge, version, model]);
}

/** The per-field surface a control renders and commits through. */
export interface InspectorFieldHandle<T> {
	readonly state: InspectorFieldState<T>;
	/** Write `value` at the active layer across the capable selection. */
	readonly commit: (value: T) => Promise<EditorCommandResult>;
	/** Remove the property at the active layer (reset — freeze D-8). */
	readonly reset: () => Promise<EditorCommandResult>;
	readonly layer: ResponsiveLayerRef;
}

/**
 * Compute and operate one top-level property of one family across the
 * current selection. `context` comes from {@link useEditorInspector}.
 */
export function useInspectorField<T>(
	context: EditorInspectorContext,
	family: InspectorFamily,
	property: string,
): InspectorFieldHandle<T> {
	const {
		authoring,
		breakpoints,
		layer,
		viewportWidth,
		commands,
		capableNodeIds,
	} = context;
	const nodeIds = capableNodeIds(family);

	const state = useMemo(
		() =>
			readFieldState<T>({
				authoring,
				nodeIds,
				family,
				property,
				layer,
				breakpoints,
				viewportWidth,
			}),
		[authoring, nodeIds, family, property, layer, breakpoints, viewportWidth],
	);

	const write = useCallback(
		(value: T | null): Promise<EditorCommandResult> => {
			/*
			 * Revision, authoring and breakpoints are read from the port
			 * HERE, not captured from the render snapshot above.
			 *
			 * A control can dispatch from a callback created before an
			 * intervening commit — the token picker's create-from-literal
			 * and import-as-copy both do exactly that: they commit
			 * `token.create`, then attach the new token through the
			 * caller's `onAttach`, which lands in this `write` while the
			 * enclosing render still holds the pre-create revision. The
			 * port compares `expectedRevision` strictly, so the attach was
			 * rejected as a conflict and the field silently kept its old
			 * literal — the token appeared in the design panel but nothing
			 * used it. Reading live is also what `useDesignSystem`'s
			 * dispatcher already does, so this makes the two agree.
			 *
			 * The port's optimistic-concurrency guard is untouched: it
			 * still rejects any command whose `expectedRevision` is stale.
			 * What changes is that the inspector no longer manufactures a
			 * stale one out of its own render timing.
			 */
			const snapshot = commands.getSnapshot();
			const command = {
				id: crypto.randomUUID(),
				expectedRevision: snapshot.revision,
				source: "inspector",
				timestamp: Date.now(),
				type: FAMILY_COMMAND_TYPE[family],
				nodeIds,
				breakpointId: layer,
				patch: { [property]: value } as EditorPatch<never>,
			} as const;
			// First write at a preset-backed breakpoint materializes the
			// effective set in the same intent (CORE-P1A-008) — switching
			// layers alone never entered history. Materialization reads the
			// same live snapshot, so it cannot plan against an authoring
			// state the document has already moved past.
			return commands.execute(
				withBreakpointMaterialization(
					command as Parameters<typeof withBreakpointMaterialization>[0],
					snapshot.authoring,
					snapshot.breakpoints,
				),
			);
		},
		[commands, family, nodeIds, layer, property],
	);

	return useMemo(
		() => ({
			state,
			commit: (value: T) => write(value),
			reset: () => write(null),
			layer,
		}),
		[state, write, layer],
	);
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
