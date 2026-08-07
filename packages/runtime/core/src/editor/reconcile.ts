/**
 * @file Pure sidecar reconciliation engine (PLAN-0020 CORE-P0-019;
 * DD-0019 §7.2 invariants 3–5, §25; decision item 13-E).
 *
 * `reconcileAuthoringState` restores invariants 3–5 from any
 * tree/sidecar divergence in one pass: authoring records whose Puck
 * nodes no longer exist are removed, and dangling references are
 * stripped everywhere they occur. Deterministic and idempotent
 * (reconcile∘reconcile = reconcile); never mutates input.
 *
 * Deliberately NOT removed: `componentInstance` state whose
 * definition is missing — ED-COMP-007 makes retention normative
 * (placeholder + `EDITOR_DEFINITION_UNAVAILABLE` at render, data
 * untouched, re-resolution when the definition returns).
 *
 * The Puck `Data` walker below is editor-owned: the existing tree
 * walkers live in the React layer (`use-layer-tree`) or the compat
 * adapter and are not importable from this React-free subpath.
 */

import type {
	Interaction,
	NodeAuthoringStateV1,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
} from "./legacy/index.js";
import type { Data } from "@puckeditor/core";

function looksLikeComponentData(
	value: unknown,
): value is { type: string; props?: Record<string, unknown> } {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		typeof (value as { type?: unknown }).type === "string" &&
		typeof (value as { props?: unknown }).props === "object"
	);
}

function collectFromNode(
	node: { props?: Record<string, unknown> },
	into: Set<string>,
): void {
	const props = node.props;
	if (props === undefined || props === null) {
		return;
	}
	const id = props.id;
	if (typeof id === "string" && id.length > 0) {
		into.add(id);
	}
	// Slot content lives as arrays of node objects inside props
	// (Puck 0.22 slot fields).
	for (const value of Object.values(props)) {
		if (Array.isArray(value)) {
			for (const entry of value) {
				if (looksLikeComponentData(entry)) {
					collectFromNode(entry, into);
				}
			}
		}
	}
}

/** Collect every live node id from Puck data (content, zones, slots). */
export function collectLiveNodeIds(data: Data): ReadonlySet<string> {
	const ids = new Set<string>();
	for (const node of data.content ?? []) {
		if (looksLikeComponentData(node)) {
			collectFromNode(node, ids);
		}
	}
	const zones = (data as { zones?: Record<string, unknown> }).zones;
	if (zones !== undefined && zones !== null) {
		for (const zone of Object.values(zones)) {
			if (Array.isArray(zone)) {
				for (const node of zone) {
					if (looksLikeComponentData(node)) {
						collectFromNode(node, ids);
					}
				}
			}
		}
	}
	return ids;
}

/** What one reconciliation pass changed (diagnostics payload). */
export interface ReconcileChangeSet {
	readonly removedNodeRecords: readonly string[];
	readonly strippedStyleRefs: number;
	readonly strippedInteractionRefs: number;
	readonly strippedBindingRefs: number;
	readonly removedInteractions: readonly string[];
	readonly removedBindings: readonly string[];
}

/** The result of a reconciliation pass. */
export interface ReconcileResult {
	readonly state: AuthoringStateV1;
	readonly changes: ReconcileChangeSet;
	readonly changed: boolean;
}

function filterRefs(
	refs: readonly string[] | undefined,
	valid: (id: string) => boolean,
): { refs: readonly string[] | undefined; stripped: number } {
	if (refs === undefined) {
		return { refs, stripped: 0 };
	}
	const next = refs.filter(valid);
	if (next.length === refs.length) {
		return { refs, stripped: 0 };
	}
	return {
		refs: next.length === 0 ? undefined : next,
		stripped: refs.length - next.length,
	};
}

/**
 * One pure reconciliation pass over `(state, puckData)`. From any
 * divergence, one pass restores invariants 3–5; no committed state
 * can retain a reference to a missing node once this runs inside the
 * commit path (CORE-P1A-016).
 */
export function reconcileAuthoringState(
	state: AuthoringStateV1,
	data: Data,
): ReconcileResult {
	const liveIds = collectLiveNodeIds(data);
	const removedNodeRecords: string[] = [];
	let strippedStyleRefs = 0;
	let strippedInteractionRefs = 0;
	let strippedBindingRefs = 0;

	// Pass 1: drop records for nodes that no longer exist.
	const keptNodes: Record<string, NodeAuthoringStateV1> = {};
	for (const [nodeId, record] of Object.entries(state.nodes)) {
		if (liveIds.has(nodeId)) {
			keptNodes[nodeId] = record;
		} else {
			removedNodeRecords.push(nodeId);
		}
	}

	// Pass 2: drop interactions/bindings anchored to missing nodes.
	const removedInteractions: string[] = [];
	const keptInteractions: Record<string, Interaction> = {};
	for (const [id, interaction] of Object.entries(state.interactions)) {
		if (liveIds.has(interaction.sourceNodeId)) {
			keptInteractions[id] = interaction;
		} else {
			removedInteractions.push(id);
		}
	}
	const removedBindings: string[] = [];
	const keptBindings: typeof state.bindings = Object.fromEntries(
		Object.entries(state.bindings).filter(([id, binding]) => {
			if (liveIds.has(binding.nodeId)) {
				return true;
			}
			removedBindings.push(id);
			return false;
		}),
	);

	// Pass 3: strip dangling references from surviving records.
	const nodes: Record<string, NodeAuthoringStateV1> = {};
	for (const [nodeId, record] of Object.entries(keptNodes)) {
		let next: NodeAuthoringStateV1 = record;

		const styleRefs = record.styleRefs;
		if (styleRefs !== undefined) {
			const validRef = (id: string) => state.styleDefinitions[id] !== undefined;
			const base = filterRefs(styleRefs.base, validRef);
			let overridesStripped = 0;
			let overrides = styleRefs.overrides;
			if (overrides !== undefined) {
				const nextOverrides: Record<string, readonly string[] | null> = {};
				for (const [breakpointId, entry] of Object.entries(overrides)) {
					if (entry === null) {
						nextOverrides[breakpointId] = entry;
						continue;
					}
					const filtered = filterRefs(entry, validRef);
					overridesStripped += filtered.stripped;
					nextOverrides[breakpointId] = filtered.refs ?? [];
				}
				if (overridesStripped > 0) {
					overrides = nextOverrides;
				}
			}
			if (base.stripped > 0 || overridesStripped > 0) {
				strippedStyleRefs += base.stripped + overridesStripped;
				const nextValue: Record<string, unknown> = { ...styleRefs };
				if (base.refs === undefined) {
					delete nextValue.base;
				} else {
					nextValue.base = base.refs;
				}
				if (overrides !== undefined) {
					nextValue.overrides = overrides;
				}
				next = {
					...next,
					styleRefs:
						nextValue.base === undefined && nextValue.overrides === undefined
							? undefined
							: (nextValue as NodeAuthoringStateV1["styleRefs"]),
				};
			}
		}

		const interactionRefs = filterRefs(
			next.interactionRefs,
			(id) => keptInteractions[id] !== undefined,
		);
		if (interactionRefs.stripped > 0) {
			strippedInteractionRefs += interactionRefs.stripped;
			next = { ...next, interactionRefs: interactionRefs.refs };
		}

		const bindingRefs = filterRefs(
			next.bindingRefs,
			(id) => keptBindings[id] !== undefined,
		);
		if (bindingRefs.stripped > 0) {
			strippedBindingRefs += bindingRefs.stripped;
			next = { ...next, bindingRefs: bindingRefs.refs };
		}

		nodes[nodeId] = next;
	}

	const changed =
		removedNodeRecords.length > 0 ||
		removedInteractions.length > 0 ||
		removedBindings.length > 0 ||
		strippedStyleRefs > 0 ||
		strippedInteractionRefs > 0 ||
		strippedBindingRefs > 0;

	return {
		state: changed
			? {
					...state,
					nodes,
					interactions: keptInteractions,
					bindings: keptBindings,
				}
			: state,
		changes: {
			removedNodeRecords,
			strippedStyleRefs,
			strippedInteractionRefs,
			strippedBindingRefs,
			removedInteractions,
			removedBindings,
		},
		changed,
	};
}

/** How `remapForDuplicate` treats each reference family (freeze list). */
export interface DuplicateRemapResult {
	readonly state: AuthoringStateV1;
	readonly copiedNodeIds: readonly string[];
}

/**
 * Generate authoring records for duplicated nodes (invariant 5):
 * layout/style/typography/hidden/styleRefs/name/locked/accessibility
 * copy verbatim; `componentInstance` copies; interaction and binding
 * refs are **not** copied — interactions and bindings are anchored
 * entities that must be re-created with fresh ids by the caller,
 * never shared between original and duplicate.
 */
export function remapForDuplicate(
	state: AuthoringStateV1,
	idMap: Readonly<Record<string, string>>,
): DuplicateRemapResult {
	const copiedNodeIds: string[] = [];
	let nodes = state.nodes;
	for (const [oldId, newId] of Object.entries(idMap)) {
		const record = state.nodes[oldId];
		if (record === undefined || state.nodes[newId] !== undefined) {
			continue;
		}
		const copy: Record<string, unknown> = { ...record };
		delete copy.interactionRefs;
		delete copy.bindingRefs;
		nodes = { ...nodes, [newId]: copy as unknown as NodeAuthoringStateV1 };
		copiedNodeIds.push(newId);
	}
	return {
		state: copiedNodeIds.length === 0 ? state : { ...state, nodes },
		copiedNodeIds,
	};
}
