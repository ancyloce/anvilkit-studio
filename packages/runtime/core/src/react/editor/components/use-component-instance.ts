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
	ComponentDefinitionV1,
	ComponentInstanceState,
	ComponentOverrideTarget,
	EditorCommandResult,
	EditorError,
	ResponsiveLayerRef,
} from "@anvilkit/contracts/editor";
import { use, useCallback, useMemo, useSyncExternalStore } from "react";
import type { InternalEditorCommandPort } from "../command-port.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import { createEditorScopeController } from "./scope.js";

/** One override the instance carries, addressed for reset/promote. */
export interface InstanceOverrideEntry {
	readonly definitionNodeId: string;
	/** `props.title`, `layout.gap`, … — display + address. */
	readonly label: string;
	readonly target: ComponentOverrideTarget;
}

/** The instance-mode surface for one selected instance node. */
export interface ComponentInstanceModel {
	readonly nodeId: string;
	readonly instance: ComponentInstanceState;
	/** `null` when the referenced definition is not in the document. */
	readonly definition: ComponentDefinitionV1 | null;
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
		target: ComponentOverrideTarget,
		layer?: ResponsiveLayerRef,
	) => Promise<EditorCommandResult | null>;
	readonly resetAllOverrides: () => Promise<EditorCommandResult | null>;
	readonly promoteOverride: (
		target: ComponentOverrideTarget,
		layer?: ResponsiveLayerRef,
	) => Promise<EditorCommandResult | null>;
	readonly detach: () => Promise<EditorCommandResult | null>;
	/**
	 * Open this instance's definition in isolated editing — the
	 * selected-instance entry point (ED-COMP-005). Transient UI state:
	 * no history entry, and the page selection is restored on exit.
	 */
	readonly editDefinition: () => void;
}

/** The diagnostic channel the variant switch reports through. */
const DIAGNOSTIC_CHANNEL = "editor.component.instance";

/** Flatten one override patch into addressable leaf entries. */
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
						definitionNodeId,
						label: `props.${key}`,
						target: { definitionNodeId, propertyPath: ["props", key] },
					});
				}
				continue;
			}
			// Responsive families address at the family level: a reset
			// clears the addressed property at one layer, and the family
			// name is the coarsest address the freeze allows (§1.2 —
			// ≥1 path segment rooted at the node).
			entries.push({
				definitionNodeId,
				label: family,
				target: { definitionNodeId, propertyPath: [family] },
			});
		}
	}
	// Exposed-prop overrides are addressed separately from node
	// overrides; they reset through the same command with a `props`
	// path on the definition ROOT node (`""` is never a node id, so
	// they are listed under their own key).
	for (const key of Object.keys(instance.propOverrides)) {
		entries.push({
			definitionNodeId: "",
			label: `prop:${key}`,
			target: { definitionNodeId: "", propertyPath: ["props", key] },
		});
	}
	return entries.sort((a, b) => a.label.localeCompare(b.label));
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

	const setVariant = useCallback(
		async (
			selection: Readonly<Record<string, string>>,
		): Promise<EditorCommandResult | null> => {
			if (resolved === null || bridge == null) return null;
			const result = await dispatch(() => ({
				type: "component.instance.variant.set",
				instanceNodeIds: [resolved.nodeId],
				variantSelection: selection,
			}));
			// Dropped overrides are reported, not swallowed: the command
			// still commits (that is the ED-VARIANT-002 contract — keep
			// what applies), and the user is told what did not survive.
			if (result !== null) {
				bridge.diagnostics.setDiagnostics(
					DIAGNOSTIC_CHANNEL,
					result.errors.filter((error) => error.severity !== "error"),
				);
			}
			return result;
		},
		[resolved, dispatch, bridge],
	);

	const resetOverride = useCallback(
		async (
			target: ComponentOverrideTarget,
			layer: ResponsiveLayerRef = "base",
		) => {
			if (resolved === null) return null;
			return dispatch(() => ({
				type: "component.override.reset",
				instanceNodeId: resolved.nodeId,
				target,
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
			const previous = port?.getSnapshot().selection.scope ?? "page";
			const targetScope = `component:${resolved.instance.definitionId}` as const;
			const needsScope = previous !== targetScope && selection != null;
			if (needsScope) {
				selection?.setScope(targetScope);
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
					selection?.setScope("page");
					selection?.select(resolved.nodeId);
				}
			}
		},
		[resolved, dispatch, bridge, port],
	);

	const detach = useCallback(async () => {
		if (resolved === null) return null;
		return dispatch(() => ({
			type: "component.instance.detach",
			instanceNodeIds: [resolved.nodeId],
		}));
	}, [resolved, dispatch]);

	const editDefinition = useCallback(() => {
		if (resolved === null || bridge?.selection == null) return;
		const selection = bridge.selection;
		// Route through the same controller the Components panel uses so
		// exit restores the page selection identically (§10.6).
		createEditorScopeController({
			getSelection: () => selection.getState(),
			setScope: (scope) => selection.setScope(scope),
			selectMany: (nodeIds) => selection.selectMany(nodeIds),
		}).enterComponent(resolved.instance.definitionId);
	}, [resolved, bridge]);

	const diagnostics = useMemo(() => {
		void version;
		return bridge?.diagnostics.getDiagnostics(DIAGNOSTIC_CHANNEL) ?? [];
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
