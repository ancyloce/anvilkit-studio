/**
 * @file Selection-wide style-target resolution for the Style panel
 * (PLAN-0028 `p4-001`). Pure and React-free.
 *
 * **Why the intersection, and not the union.**
 *
 * `readNodeField` *excludes* nodes that do not declare a target or do
 * not grant a property — a read over a mixed selection quietly answers
 * for the capable subset. `updateAppearanceInData` does the opposite:
 * one incapable node makes the whole intent `rejected`, because a
 * partial multi-selection write would break "one atomic multi-selection
 * update" (§14.1).
 *
 * A panel built on the read side alone would therefore render controls
 * whose commit is guaranteed to fail. Resolving the selection to the
 * targets **every** selected node declares, and to the properties every
 * one of them grants, is what makes the panel structurally unable to
 * offer an edit the writer would refuse.
 */

import type { AuthorableStyleProperty } from "@anvilkit/contracts/editor";
import type { DocumentModel } from "../../../../document-model/index.js";
import type { ResolvedStyleTarget } from "../../../../puck/component-metadata.js";

/** A target every selected node declares, with the granted overlap. */
export interface SelectionStyleTarget {
	readonly id: string;
	readonly label: string;
	/**
	 * `true` only when EVERY selected node declares the target
	 * responsive. A breakpoint write is one atomic update across the
	 * selection, so one non-responsive member makes the whole edit a
	 * base-layer edit — enabling the control on the strength of the
	 * others would promise an override that cannot land.
	 */
	readonly responsive: boolean;
	/** Properties granted by every selected node, in declaration order. */
	readonly properties: readonly AuthorableStyleProperty[];
}

const EMPTY: readonly SelectionStyleTarget[] = Object.freeze([]);

/**
 * The style targets the whole selection has in common.
 *
 * Returns `[]` for an empty selection, for a selection containing an
 * unknown node id, and for a selection whose members share no target —
 * all of which the panel reports as "no declared appearance" rather
 * than papering over.
 */
export function selectionStyleTargets(
	model: DocumentModel,
	nodeIds: readonly string[],
): readonly SelectionStyleTarget[] {
	if (nodeIds.length === 0) return EMPTY;
	const declarations: (readonly ResolvedStyleTarget[])[] = [];
	for (const nodeId of nodeIds) {
		const node = model.nodes.get(nodeId);
		// An id the document does not hold cannot be written either, so
		// the honest common set is empty rather than "everyone else's".
		if (node === undefined) return EMPTY;
		declarations.push(node.styleTargets);
	}

	const [first, ...rest] = declarations;
	if (first === undefined) return EMPTY;
	const common: SelectionStyleTarget[] = [];
	for (const target of first) {
		const peers = rest.map((entry) =>
			entry.find((candidate) => candidate.id === target.id),
		);
		if (peers.some((peer) => peer === undefined)) continue;
		const granted = target.properties.filter((property) =>
			peers.every((peer) => peer?.properties.includes(property) === true),
		);
		common.push({
			id: target.id,
			label: target.label,
			responsive:
				target.responsive && peers.every((peer) => peer?.responsive === true),
			properties: granted,
		});
	}
	return common.length === 0 ? EMPTY : common;
}

/* ------------------------------------------------------------------ *
 * Presence — "is this declared target in the current render?"
 * ------------------------------------------------------------------ */

/**
 * The element index {@link resolveTargetPresence} reads.
 *
 * Declared **structurally** rather than imported from
 * `canvas/dom-registry.ts` on purpose: presence is a property of
 * whatever index the host has, and typing it this way keeps the
 * composition layer free of a dependency edge into the canvas layer
 * (and this module free of `HTMLElement`, so it stays pure and
 * React-free). `CanvasDomRegistry` satisfies it by shape — `p5-001`'s
 * `getTargetElements` is plural at the type level, and that plurality
 * is exactly what "present" means here.
 */
export interface TargetElementSource {
	/** Every element stamped for a node id; empty when it is unmounted. */
	getElements(nodeId: string): readonly unknown[];
	/** Every element stamped with the `(nodeId, targetId)` pair. */
	getTargetElements(nodeId: string, targetId: string): readonly unknown[];
}

/**
 * A {@link TargetElementSource} that can also say **when** it changed
 * (PLAN-0028 `p5-004`).
 *
 * The count in §3.7.4 is worthless the moment it is stale — adding a
 * fourth post has to move "3" to "4" — so anything rendering it needs
 * the notification half of the index, not just the read half. Declared
 * as an extension of the same structural interface rather than as a
 * second one so there is still exactly ONE seam between the composition
 * layer and the canvas registry, and `CanvasDomRegistry` still satisfies
 * it by shape (`canvas/dom-registry.ts` `observe`).
 */
export interface ObservableTargetElementSource extends TargetElementSource {
	/** Subscribe to structural changes. Returns an unsubscribe fn. */
	observe(listener: () => void): () => void;
}

/**
 * Whether a declared target has an element in the current render.
 *
 * **`"unknown"` is a first-class answer, not a failure mode.** A Style
 * panel can be mounted with no canvas at all (a bare `<Puck>`, the
 * shell's stated degraded path), and a canvas that has not yet reported
 * its document indexes nothing. In both cases every declared target
 * would look absent, and labelling them "not in this render" would be a
 * *fabricated* claim — the §8.5 rule cuts both ways. So the panel
 * distinguishes "I looked and it is not there" from "I cannot see", and
 * only the former disables anything.
 */
export type TargetPresence = "present" | "absent" | "unknown";

/**
 * Resolve one declared target's presence across the selection.
 *
 * Only nodes the index actually holds can answer: an unmounted node
 * says nothing about its own targets, so it is skipped rather than
 * counted as a miss. If no selected node is mounted the answer is
 * `"unknown"`.
 *
 * Across a mounted multi-selection the target is `"present"` when **any**
 * member renders it. That is the honest reading of the label: selecting
 * it will outline something and the edit will be visible. It is
 * deliberately *not* the intersection rule `selectionStyleTargets` uses
 * — that rule is about what can be **written**, which is a declaration
 * question and does not change because one node's render branch
 * currently has no cards.
 */
export function resolveTargetPresence(
	source: TargetElementSource | null,
	nodeIds: readonly string[],
	targetId: string,
): TargetPresence {
	if (source === null) return "unknown";
	let anyMounted = false;
	for (const nodeId of nodeIds) {
		if (source.getElements(nodeId).length === 0) continue;
		anyMounted = true;
		if (source.getTargetElements(nodeId, targetId).length > 0) {
			return "present";
		}
	}
	return anyMounted ? "absent" : "unknown";
}

/**
 * How many elements the next edit to this target will reach
 * (PLAN-0026 §3.7.4, PLAN-0028 `p5-004`).
 *
 * **This is a fact about the compiler, not a defensive guess.** A
 * repeated element stamps ONE target id on EVERY instance it renders —
 * `blog-list` spreads `targetAttrs.card` once per post — and
 * `style-compiler/compile.ts` emits ONE exact-pair selector per
 * `(node, target)`. Styling `card` therefore styles every card of that
 * node, and this number is exactly how many that is.
 *
 * Summed across the selection because a multi-selection write is one
 * atomic update (`updateAppearanceInData`): styling `card` with two
 * blog-lists selected reaches both lists' cards, so reporting only the
 * primary's would understate what the author is about to do.
 *
 * `0` for no source and for an unmounted selection — the caller renders
 * nothing at all below 2, so "I cannot see" and "there is one" collapse
 * to the same (silent) treatment and neither can be mistaken for a
 * claim. Presence, which *is* claimed, stays tri-state in
 * {@link resolveTargetPresence}.
 */
export function countTargetElements(
	source: TargetElementSource | null,
	nodeIds: readonly string[],
	targetId: string,
): number {
	if (source === null) return 0;
	let total = 0;
	for (const nodeId of nodeIds) {
		total += source.getTargetElements(nodeId, targetId).length;
	}
	return total;
}

/** The authored-state summary the panel exposes as data attributes. */
export interface AuthoredSummary {
	readonly baseProperties: number;
	readonly overrideLayers: number;
	readonly styleRefs: number;
	readonly hidden: boolean;
}

const NOTHING_AUTHORED: AuthoredSummary = Object.freeze({
	baseProperties: 0,
	overrideLayers: 0,
	styleRefs: 0,
	hidden: false,
});

/**
 * Summarize one node's authored appearance for one target.
 *
 * Kept from the P2-02 read-only panel verbatim: the four
 * `data-authored-*` attributes it feeds are read by the existing E2E
 * suites and by `p8-008`, so their meaning must not move under them.
 */
export function summarizeAuthoredTarget(
	model: DocumentModel,
	nodeId: string | null,
	targetId: string,
): AuthoredSummary {
	const target =
		nodeId === null
			? undefined
			: model.nodes.get(nodeId)?.appearance?.targets?.[targetId];
	if (target === undefined) return NOTHING_AUTHORED;
	const base = target.style?.base;
	return {
		baseProperties:
			Object.keys(base?.layout ?? {}).length +
			Object.keys(base?.visual ?? {}).length +
			Object.keys(base?.typography ?? {}).length,
		overrideLayers: Object.values(target.style?.overrides ?? {}).filter(
			(layer) => layer !== null,
		).length,
		styleRefs: target.styleRefs?.base?.length ?? 0,
		hidden: target.hidden?.base === true,
	};
}
