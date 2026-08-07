"use client";

/**
 * @file `useComponentInstance` — the instance-mode model behind the
 * inspector's Component section (PLAN-0020 CORE-P2-009H;
 * ED-COMP-003/-004/-007/-008, ED-VARIANT-002; DD-0019 §14.4, §14.5).
 *
 * Everything a user can do to a *placed* component: pick its variant,
 * see which overrides it carries, reset one or all of them, promote
 * one into the definition, and detach it into plain nodes.
 *
 * Two behaviours here exist because the spec calls for them
 * explicitly, and both are easy to get silently wrong:
 *
 * - **Compatible overrides survive a variant switch.** The engine's
 *   `switchInstanceVariant` keeps every override that still addresses
 *   a live node/property under the new selection and *reports* the
 *   rest. This hook surfaces that report as diagnostics rather than
 *   discarding it, so a dropped override is visible instead of being
 *   a mystery (ED-VARIANT-002).
 * - **An unresolvable definition retains its instance data.** Nothing
 *   here deletes `componentInstance` when a definition is missing;
 *   the instance keeps its overrides and re-resolves when the
 *   definition returns (ED-COMP-007).
 */

import type {
	ComponentDefinition,
	ComponentInstanceState,
	ComponentOverrideTarget,
	EditorError,
	ResponsiveLayerRef,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommandResult,
} from "../../../editor/legacy/index.js";
import {
	use,
	useCallback,
	useEffect,
	useMemo,
	useSyncExternalStore,
} from "react";
import type { InternalEditorCommandPort } from "../command-port.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import { getEditorScopeController } from "./scope.js";

/** One override the instance carries, addressed for reset/promote. */
export interface InstanceOverrideEntry {
	/**
	 * `"node"` overrides address a definition node and reset through
	 * `component.override.reset`; `"exposedProp"` overrides hang off the
	 * instance and clear through `component.instance.propOverride.set`
	 * with a `null` value. Promote applies to node overrides only.
	 */
	readonly kind: "node" | "exposedProp";
	readonly definitionNodeId: string;
	/** `title`, `layout`, … — display + last address segment. */
	readonly label: string;
	/** Set for `kind: "exposedProp"`. */
	readonly propId?: string;
	readonly target: ComponentOverrideTarget;
}

/** The instance-mode surface for one selected instance node. */
export interface ComponentInstanceModel {
	readonly nodeId: string;
	readonly instance: ComponentInstanceState;
	/** `null` when the referenced definition is not in the document. */
	readonly definition: ComponentDefinition | null;
	/** True when the definition is missing — data retained (ED-COMP-007). */
	readonly unresolved: boolean;
	readonly overrides: readonly InstanceOverrideEntry[];
	readonly canMutate: boolean;
	/** Diagnostics from the last variant switch (dropped overrides). */
	readonly diagnostics: readonly EditorError[];
	readonly setVariant: (
		selection: Readonly<Record<string, string>>,
	) => Promise<EditorCommandResult | null>;
	readonly resetOverride: (
		entry: InstanceOverrideEntry,
		layer?: ResponsiveLayerRef,
	) => Promise<EditorCommandResult | null>;
	readonly resetAllOverrides: () => Promise<EditorCommandResult | null>;
	readonly promoteOverride: (
		target: ComponentOverrideTarget,
		layer?: ResponsiveLayerRef,
	) => Promise<EditorCommandResult | null>;
	readonly detach: () => Promise<DetachOutcome>;
	/**
	 * Open this instance's definition in isolated editing — the
	 * selected-instance entry point (ED-COMP-005). Transient UI state:
	 * no history entry, and the page selection is restored on exit.
	 */
	readonly editDefinition: () => void;
}

/** The outcome of a detach attempt. */
export interface DetachOutcome {
	readonly status: "committed" | "rejected";
	readonly errors: readonly EditorError[];
}

/** The diagnostic channel the variant switch reports through. */
const DIAGNOSTIC_CHANNEL = "editor.component.instance";

/**
 * Flatten one instance's overrides into addressable leaf entries.
 *
 * **Addressing rule (freeze §1.2):** `ComponentOverrideTarget.
 * propertyPath` is rooted at the definition node's `props`, and a
 * leading responsive-family segment (`layout` / `style` /
 * `typography` / `hidden`) switches it to that family. So a prop
 * override is `["title"]`, **not** `["props","title"]` — the second
 * form addresses a prop literally named `props` and silently resets
 * nothing.
 */
function overrideEntries(
	instance: ComponentInstanceState,
): readonly InstanceOverrideEntry[] {
	const entries: InstanceOverrideEntry[] = [];
	for (const [definitionNodeId, patch] of Object.entries(
		instance.nodeOverrides,
	)) {
		for (const [family, value] of Object.entries(patch)) {
			if (value === undefined) continue;
			if (family === "props") {
				for (const key of Object.keys(
					value as Readonly<Record<string, unknown>>,
				)) {
					entries.push({
						kind: "node",
						definitionNodeId,
						label: key,
						target: { definitionNodeId, propertyPath: [key] },
					});
				}
				continue;
			}
			// Responsive families address at the family level: the reset
			// clears that family at the addressed layer.
			entries.push({
				kind: "node",
				definitionNodeId,
				label: family,
				target: { definitionNodeId, propertyPath: [family] },
			});
		}
	}
	// Exposed-prop overrides are a different address space — they hang
	// off the instance, not a definition node — and are cleared by
	// writing `null` through `component.instance.propOverride.set`
	// rather than by `component.override.reset`.
	for (const key of Object.keys(instance.propOverrides)) {
		entries.push({
			kind: "exposedProp",
			definitionNodeId: "",
			label: key,
			propId: key,
			target: { definitionNodeId: "", propertyPath: [key] },
		});
	}
	return entries.sort(
		(a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label),
	);
}

/**
 * The instance model for the primary selected node, or `null` when
 * nothing selected is a component instance.
 */
export function useComponentInstance(): ComponentInstanceModel | null {
	const bridge = use(StudioEditorBridgeContext);
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);
	const port = bridge?.port as InternalEditorCommandPort | null | undefined;

	const resolved = useMemo(() => {
		void version;
		if (port == null) return null;
		const snapshot = port.getSnapshot();
		const nodeId = snapshot.selection.primaryId;
		if (nodeId === undefined) return null;
		const instance = snapshot.authoring.nodes[nodeId]?.componentInstance;
		if (instance === undefined) return null;
		return {
			nodeId,
			instance,
			definition:
				snapshot.authoring.componentDefinitions[instance.definitionId] ?? null,
		};
	}, [port, version]);

	const dispatch = useCallback(
		async (
			build: (revision: number) => Record<string, unknown>,
		): Promise<EditorCommandResult | null> => {
			if (port == null) return null;
			const revision = port.getSnapshot().revision;
			return port.execute({
				id: crypto.randomUUID(),
				expectedRevision: revision,
				source: "inspector",
				timestamp: Date.now(),
				...build(revision),
			} as never);
		},
		[port],
	);

	/**
	 * Switch the instance's variant (ED-VARIANT-002).
	 *
	 * Overrides that still apply under the new combination survive;
	 * the rest are dropped **with a visible diagnostic**. Producing
	 * that diagnostic is this layer's job by design: `applyEditorCommand`
	 * reduces `AuthoringStateV1` and returns only the next state, so
	 * `switchInstanceVariant`'s `dropped` report is discarded by the
	 * reducer — which left the "never silently" half of ED-VARIANT-002
	 * unreachable. Re-running the pure switch against the pre-command
	 * snapshot recovers it without changing the frozen reducer
	 * signature; it is a pure function over a bounded object, and the
	 * result is byte-identical to what the reducer computes.
	 */
	const setVariant = useCallback(
		async (
			selection: Readonly<Record<string, string>>,
		): Promise<EditorCommandResult | null> => {
			if (resolved === null || bridge == null || port == null) return null;
			const before = port.getSnapshot().authoring;
			const { droppedOverrideDiagnostics, switchInstanceVariant } =
				await import("../../../editor/index.js");
			const preview = switchInstanceVariant(
				before,
				[resolved.nodeId],
				selection,
			);
			const result = await dispatch(() => ({
				type: "component.instance.variant.set",
				instanceNodeIds: [resolved.nodeId],
				selection,
			}));
			if (result !== null && result.status === "committed") {
				bridge.diagnostics.setDiagnostics(DIAGNOSTIC_CHANNEL, [
					...droppedOverrideDiagnostics(preview.dropped),
					...result.errors.filter((error) => error.severity !== "error"),
				]);
			}
			return result;
		},
		[resolved, dispatch, bridge, port],
	);

	const resetOverride = useCallback(
		async (
			entry: InstanceOverrideEntry,
			layer: ResponsiveLayerRef = "base",
		) => {
			if (resolved === null) return null;
			if (entry.kind === "exposedProp") {
				return dispatch(() => ({
					type: "component.instance.propOverride.set",
					instanceNodeId: resolved.nodeId,
					propId: entry.propId,
					value: null,
				}));
			}
			return dispatch(() => ({
				type: "component.override.reset",
				instanceNodeId: resolved.nodeId,
				target: entry.target,
				layer,
			}));
		},
		[resolved, dispatch],
	);

	const resetAllOverrides = useCallback(async () => {
		if (resolved === null) return null;
		return dispatch(() => ({
			type: "component.override.resetAll",
			instanceNodeIds: [resolved.nodeId],
		}));
	}, [resolved, dispatch]);

	const promoteOverride = useCallback(
		async (
			target: ComponentOverrideTarget,
			layer: ResponsiveLayerRef = "base",
		) => {
			if (resolved === null || bridge == null) return null;
			// Promote writes into the DEFINITION, so freeze §6 requires the
			// component's own scope. Entering it around the dispatch keeps
			// the affordance available from instance mode (where the user
			// is looking at the override) without weakening the guard.
			const selection = bridge.selection;
			const previous = port?.getSnapshot().selection.definitionScope ?? "page";
			const targetScope =
				`component:${resolved.instance.definitionId}` as const;
			const needsScope = previous !== targetScope && selection != null;
			if (needsScope) {
				selection?.setDefinitionScope(targetScope);
			}
			try {
				return await dispatch(() => ({
					type: "component.override.promote",
					instanceNodeId: resolved.nodeId,
					target,
					layer,
				}));
			} finally {
				if (needsScope) {
					// Back to the scope the user was actually in — not a
					// hardcoded "page". Promoting from inside another
					// component's isolated scope used to eject the user to the
					// page entirely. This does not route through
					// `getEditorScopeController`, whose `exitScope()` always
					// lands on "page" and so cannot express a transient
					// round-trip back to the originating scope.
					selection?.setDefinitionScope(previous);
					selection?.select(resolved.nodeId);
				}
			}
		},
		[resolved, dispatch, bridge, port],
	);

	/**
	 * Detach the instance into ordinary page nodes (ED-COMP-004).
	 *
	 * `component.instance.detach` is in the frozen command union but is
	 * **not** a sidecar reduction: materializing an instance rewrites
	 * the Puck tree, which `applyEditorCommand` cannot express (it
	 * reduces `AuthoringStateV1` alone). So the detach runs through
	 * `commitNative` — the same tier-(a) seam create-from-selection
	 * uses — which lands the tree change and the sidecar reconciliation
	 * in ONE history-recording dispatch.
	 *
	 * An unresolvable definition rejects rather than half-detaching:
	 * the instance's data must survive (ED-COMP-007).
	 */
	const detach = useCallback(async (): Promise<DetachOutcome> => {
		if (resolved === null || port == null || bridge == null) {
			return { status: "rejected", errors: [] };
		}
		const { buildDetachPlan, isDetachFailure } = await import(
			"../../../editor/index.js"
		);
		let failure: EditorError | null = null;
		const committed = port.commitNative((data, authoring) => {
			const plan = buildDetachPlan(data, authoring, [resolved.nodeId], () =>
				crypto.randomUUID(),
			);
			if (plan === null) return null;
			if (isDetachFailure(plan)) {
				failure = {
					code: "EDITOR_DEFINITION_UNAVAILABLE",
					severity: "error",
					message:
						"this component cannot be detached because its definition is unavailable",
					recoverable: true,
					nodeIds: [plan.instanceNodeId],
					details: { kind: "componentInstance", reason: plan.reason.status },
				};
				return null;
			}
			return { data: plan.data, authoring: plan.authoring };
		});
		if (failure !== null) {
			bridge.diagnostics.setDiagnostics(DIAGNOSTIC_CHANNEL, [failure]);
			return { status: "rejected", errors: [failure] };
		}
		// A successful detach clears whatever the previous attempt left
		// behind, so a stale failure cannot outlive the condition it
		// described.
		bridge.diagnostics.setDiagnostics(DIAGNOSTIC_CHANNEL, []);
		return {
			status: committed === "committed" ? "committed" : "rejected",
			errors: [],
		};
	}, [resolved, port, bridge]);

	const editDefinition = useCallback(() => {
		if (resolved === null || bridge?.selection == null) return;
		const selection = bridge.selection;
		// Route through the same controller the Components panel uses so
		// exit restores the page selection identically (§10.6).
		getEditorScopeController(selection).enterComponent(
			resolved.instance.definitionId,
		);
	}, [resolved, bridge]);

	/*
	 * Diagnostics here describe ONE instance, so they are dropped the
	 * moment the user selects a different one. Without this, switching
	 * instance A's variant (say, two overrides dropped) and then clicking
	 * instance B rendered A's drop report inside B's inspector as though
	 * it described B.
	 */
	const instanceNodeId = resolved?.nodeId;
	useEffect(() => {
		// `instanceNodeId` is the trigger, not an input — re-running when
		// it changes is the entire point of this effect.
		void instanceNodeId;
		bridge?.diagnostics.setDiagnostics(DIAGNOSTIC_CHANNEL, []);
	}, [bridge, instanceNodeId]);

	const diagnostics = useMemo(() => {
		void version;
		// This hook's OWN channel. The flattened `getDiagnostics()` view
		// spans every source, so re-identifying entries by `details.kind`
		// also picked up identically-shaped diagnostics published
		// elsewhere — `validateCreateComponentSelection` emits
		// `kind: "componentInstance"` errors onto the create channel.
		return bridge?.diagnostics.getDiagnosticsFor(DIAGNOSTIC_CHANNEL) ?? [];
	}, [bridge, version]);

	return useMemo(() => {
		if (resolved === null || port == null) return null;
		return {
			nodeId: resolved.nodeId,
			instance: resolved.instance,
			definition: resolved.definition,
			unresolved: resolved.definition === null,
			overrides: overrideEntries(resolved.instance),
			canMutate: !port.isReadOnly() && !port.writersDisabled(),
			diagnostics,
			setVariant,
			resetOverride,
			resetAllOverrides,
			promoteOverride,
			detach,
			editDefinition,
		};
	}, [
		resolved,
		port,
		diagnostics,
		setVariant,
		resetOverride,
		resetAllOverrides,
		promoteOverride,
		detach,
		editDefinition,
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
