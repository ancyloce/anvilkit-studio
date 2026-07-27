"use client";

/**
 * @file Render-time binding resolution (PLAN-0020 CORE-P3-006;
 * ED-BIND-002; DD-0019 §19; ADR 0006).
 *
 * The seam that lets an authored binding actually change what the
 * canvas shows. `decorate-config` reads this context per node — the
 * same shape `AuthoringStyleContext` uses — so the decoration stays a
 * thin lookup and all the policy lives here.
 *
 * ### The scope is host-supplied, never fetched here
 *
 * ADR 0006: `_dataSource` fills the scope, bindings read it. Core does
 * not fetch at render time and holds no cache, because §19 permits
 * storing descriptors and expressions but **never preview responses**.
 * `StudioEditorConfig.renderScope` is the host's channel for that.
 *
 * ### Design mode shows, preview mode hides
 *
 * §19 asks for "visibility bindings with design placeholder". A node
 * the author cannot select is a node they cannot repair, so design
 * mode always renders it — marked, never removed. Only preview honours
 * the binding by hiding. `indeterminate` (missing path, or an
 * expression the evaluator refused) renders in **both** modes: hiding
 * content because a data source hiccuped loses information, whereas
 * showing it is merely unfiltered.
 */

import type { BindingV1, JsonValue } from "@anvilkit/contracts/editor";
import { createContext, type ReactNode, use, useMemo } from "react";
import {
	buildRepeatContexts,
	evaluateExpression,
	isVisibleInPreview,
	type RepeatContext,
	resolveVisibility,
} from "../../../editor/index.js";

/** What a decorated render needs to know about one node's bindings. */
export interface NodeBindingRender {
	/** True when preview mode should omit this node entirely. */
	readonly hiddenInPreview: boolean;
	/** True when a visibility binding applies but could not be decided. */
	readonly indeterminate: boolean;
	/** Whether the canvas is previewing — only then is hiding applied. */
	readonly previewMode: boolean;
	/**
	 * Render contexts for a repeat binding, or `null` when the node has
	 * none. Empty array = a repeat that resolved to zero rows.
	 */
	readonly repeat: readonly RepeatContext[] | null;
}

/** Resolve one node's binding-driven render state. */
export type BindingRenderLookup = (nodeId: string) => NodeBindingRender | null;

/**
 * Per-node binding render state. `null` when the editor is off or the
 * document has no bindings — decorated renders then behave exactly as
 * they did before Phase 3.
 */
export const BindingRenderContext = createContext<BindingRenderLookup | null>(
	null,
);

/** Props for {@link BindingRenderProvider}. */
export interface BindingRenderProviderProps {
	readonly bindings: Readonly<Record<string, BindingV1>>;
	/** Host-supplied roots (`data`, `page`). */
	readonly scope: { readonly data?: JsonValue; readonly page?: JsonValue };
	/** Preview mode honours visibility; design mode only marks it. */
	readonly preview: boolean;
	readonly children: ReactNode;
}

/**
 * Provide render-time binding resolution.
 *
 * Memoised on the bindings map, the scope and the mode — the three
 * things that can change the answer — so decorated renders do not
 * re-resolve on unrelated commits.
 */
export function BindingRenderProvider({
	bindings,
	scope,
	preview,
	children,
}: BindingRenderProviderProps): ReactNode {
	const lookup = useMemo<BindingRenderLookup | null>(() => {
		const entries = Object.values(bindings);
		if (entries.length === 0) return null;

		// Indexed once per change rather than scanned per node: a document
		// with many nodes and a few bindings would otherwise be O(n*m) on
		// every canvas render.
		const byNode = new Map<string, BindingV1[]>();
		for (const binding of entries) {
			const list = byNode.get(binding.nodeId);
			if (list === undefined) byNode.set(binding.nodeId, [binding]);
			else list.push(binding);
		}

		const resolvedByNode = new Map<string, NodeBindingRender>();
		for (const [nodeId, list] of byNode) {
			let hiddenInPreview = false;
			let indeterminate = false;
			let repeat: readonly RepeatContext[] | null = null;

			for (const binding of list) {
				if (binding.target.type === "visibility") {
					const resolution = resolveVisibility(binding.expression, scope);
					if (resolution.status === "indeterminate") indeterminate = true;
					if (!isVisibleInPreview(resolution)) hiddenInPreview = true;
					continue;
				}
				if (binding.target.type === "repeat") {
					// The expression selects the collection; the limit is the
					// author's, still bounded by §19's default downstream.
					const evaluated = resolveRepeatSource(binding, scope);
					repeat = buildRepeatContexts(
						evaluated,
						binding.target.limit ?? DEFAULT_REPEAT_LIMIT,
					).contexts;
				}
			}
			resolvedByNode.set(nodeId, {
				hiddenInPreview,
				indeterminate,
				previewMode: preview,
				repeat,
			});
		}

		return (nodeId: string) => resolvedByNode.get(nodeId) ?? null;
	}, [bindings, scope, preview]);

	return <BindingRenderContext value={lookup}>{children}</BindingRenderContext>;
}

/** §19's default record cap, mirrored for render-time expansion. */
const DEFAULT_REPEAT_LIMIT = 50;

/**
 * Evaluate a repeat binding's expression to its collection.
 *
 * Separate from `resolveVisibility` because a repeat wants the *value*,
 * not a truthiness verdict. A missing or refused expression yields an
 * empty collection — zero rows, rather than a crash or a phantom row.
 */
function resolveRepeatSource(
	binding: BindingV1,
	scope: { readonly data?: JsonValue; readonly page?: JsonValue },
): JsonValue {
	const result = evaluateExpression(binding.expression, scope);
	return result.status === "value" ? result.value : [];
}

/** Read the binding render state for one node. */
export function useNodeBindingRender(
	nodeId: string | undefined,
): NodeBindingRender | null {
	const lookup = use(BindingRenderContext);
	if (lookup === null || nodeId === undefined) return null;
	return lookup(nodeId);
}
