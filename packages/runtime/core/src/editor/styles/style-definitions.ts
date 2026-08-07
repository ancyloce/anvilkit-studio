/**
 * @file Reusable style-definition operations (PLAN-0020 CORE-P2-003;
 * ED-STYLEDEF-001/002; DD-0019 §11.3, §15.1).
 *
 * Style definitions are an **ordered multi-attach list, not an
 * inheritance graph**: a node holds `styleRefs` (itself responsive),
 * later refs win over earlier ones, and the node's own values win over
 * all of them (§24.3 precedence, implemented in `resolveNodeAuthoring`).
 *
 * Because nodes reference definitions by id and never copy them,
 * `styleDefinition.update` propagates for free (ED-STYLEDEF-002) —
 * there is nothing per-node to rewrite.
 */

import type {
	NodeAuthoringStateV1,
	ResponsiveLayerRef,
	ResponsiveValue,
	StyleDefinitionId,
	StyleDefinition,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
} from "../legacy/index.js";
import { getRecord, withRecord } from "../node-records.js";
import { mergePropertyWise } from "../resolve/merge.js";

/** The families a style definition contributes. */
const STYLE_FAMILIES = ["layout", "style", "typography"] as const;
type StyleFamily = (typeof STYLE_FAMILIES)[number];

/** Read a node's ordered refs at one layer (no inheritance folding). */
function refsAt(
	record: NodeAuthoringStateV1 | undefined,
	layer: ResponsiveLayerRef,
): readonly StyleDefinitionId[] | undefined {
	const refs = record?.styleRefs;
	if (refs === undefined) {
		return undefined;
	}
	if (layer === "base") {
		return refs.base;
	}
	const entry = refs.overrides?.[layer];
	return entry === null ? undefined : entry;
}

/** Write a node's ref list at one layer, collapsing empties away. */
function withRefsAt(
	record: NodeAuthoringStateV1,
	layer: ResponsiveLayerRef,
	next: readonly StyleDefinitionId[] | undefined,
): NodeAuthoringStateV1 {
	const refs = record.styleRefs ?? {};
	const collapsed = next !== undefined && next.length > 0 ? next : undefined;
	const value: ResponsiveValue<readonly StyleDefinitionId[]> = { ...refs };
	if (layer === "base") {
		if (collapsed === undefined) {
			delete (value as { base?: unknown }).base;
		} else {
			(value as { base?: readonly StyleDefinitionId[] }).base = collapsed;
		}
	} else {
		const overrides = { ...(refs.overrides ?? {}) };
		if (collapsed === undefined) {
			delete overrides[layer];
		} else {
			overrides[layer] = collapsed;
		}
		if (Object.keys(overrides).length === 0) {
			delete (value as { overrides?: unknown }).overrides;
		} else {
			(
				value as {
					overrides?: Record<string, readonly StyleDefinitionId[] | null>;
				}
			).overrides = overrides;
		}
	}
	const empty = value.base === undefined && value.overrides === undefined;
	const nextRecord: NodeAuthoringStateV1 = { ...record };
	if (empty) {
		delete (nextRecord as { styleRefs?: unknown }).styleRefs;
	} else {
		(
			nextRecord as {
				styleRefs?: ResponsiveValue<readonly StyleDefinitionId[]>;
			}
		).styleRefs = value;
	}
	return nextRecord;
}

/**
 * Insert `styleDefinitionId` into a node's ordered ref list at
 * `layer`. Re-attaching an already-present definition is a no-op
 * (the list is a set with meaningful order, not a bag).
 */
export function attachStyleDefinition(
	state: AuthoringStateV1,
	nodeIds: readonly string[],
	styleDefinitionId: StyleDefinitionId,
	layer: ResponsiveLayerRef,
	position?: number,
): AuthoringStateV1 {
	let next = state;
	for (const nodeId of nodeIds) {
		const record = getRecord(next, nodeId);
		const current = refsAt(record, layer) ?? [];
		if (current.includes(styleDefinitionId)) {
			continue;
		}
		const refs = [...current];
		const index =
			position === undefined
				? refs.length
				: Math.max(0, Math.min(position, refs.length));
		refs.splice(index, 0, styleDefinitionId);
		next = withRecord(next, nodeId, withRefsAt(record, layer, refs));
	}
	return next;
}

/** Remove one ref from a node's ordered list at `layer`. */
export function detachStyleDefinition(
	state: AuthoringStateV1,
	nodeIds: readonly string[],
	styleDefinitionId: StyleDefinitionId,
	layer: ResponsiveLayerRef,
): AuthoringStateV1 {
	let next = state;
	for (const nodeId of nodeIds) {
		const record = next.nodes[nodeId];
		if (record === undefined) {
			continue;
		}
		const current = refsAt(record, layer);
		if (current === undefined || !current.includes(styleDefinitionId)) {
			continue;
		}
		next = withRecord(
			next,
			nodeId,
			withRefsAt(
				record,
				layer,
				current.filter((id) => id !== styleDefinitionId),
			),
		);
	}
	return next;
}

/** Every layer at which a node declares a ref list. */
function declaredLayers(
	record: NodeAuthoringStateV1,
): readonly ResponsiveLayerRef[] {
	const refs = record.styleRefs;
	if (refs === undefined) {
		return [];
	}
	const layers: ResponsiveLayerRef[] = [];
	if (refs.base !== undefined) {
		layers.push("base");
	}
	for (const [layer, entry] of Object.entries(refs.overrides ?? {})) {
		if (entry !== null && entry !== undefined) {
			layers.push(layer);
		}
	}
	return layers;
}

function familyAt(
	definition: StyleDefinition | undefined,
	family: StyleFamily,
	layer: ResponsiveLayerRef,
): object | undefined {
	const value = definition?.[family] as ResponsiveValue<object> | undefined;
	if (value === undefined) {
		return undefined;
	}
	if (layer === "base") {
		return value.base;
	}
	const entry = value.overrides?.[layer];
	return entry === null ? undefined : entry;
}

/** Merge a ref list's contribution for one family at one layer. */
function stackFor(
	state: AuthoringStateV1,
	refs: readonly StyleDefinitionId[],
	family: StyleFamily,
	layer: ResponsiveLayerRef,
): Partial<object> {
	return mergePropertyWise<object>(
		...refs.map((id) => familyAt(state.styleDefinitions[id], family, layer)),
	);
}

/**
 * Delete a style definition, dropping every reference to it.
 *
 * Under `"materialize"` the node keeps its exact appearance: for each
 * referencing node and layer we diff the merged definition stack with
 * and without the deleted definition, and write only the differing
 * properties into the node's own layer, **below** the node's existing
 * values.
 *
 * The diff — rather than "copy the deleted definition's properties" —
 * is what makes this correct for ordered multi-attach. Copying
 * wholesale would promote the deleted definition's values above any
 * definition that legitimately overrode them, silently changing the
 * rendered result whenever the deleted entry was not last in the list.
 */
export function deleteStyleDefinition(
	state: AuthoringStateV1,
	styleDefinitionId: StyleDefinitionId,
	materialize: boolean,
): AuthoringStateV1 {
	if (state.styleDefinitions[styleDefinitionId] === undefined) {
		return state;
	}
	let nextState = state;

	for (const [nodeId, record] of Object.entries(state.nodes)) {
		let nextRecord = record;
		for (const layer of declaredLayers(record)) {
			const current = refsAt(nextRecord, layer);
			if (current === undefined || !current.includes(styleDefinitionId)) {
				continue;
			}
			const remaining = current.filter((id) => id !== styleDefinitionId);

			if (materialize) {
				for (const family of STYLE_FAMILIES) {
					const before = stackFor(state, current, family, layer);
					const after = stackFor(state, remaining, family, layer);
					const delta: Record<string, unknown> = {};
					for (const [key, value] of Object.entries(before)) {
						if (
							(after as Record<string, unknown>)[key] !==
							(before as Record<string, unknown>)[key]
						) {
							delta[key] = value;
						}
					}
					if (Object.keys(delta).length === 0) {
						continue;
					}
					const familyValue = nextRecord[family] as
						| ResponsiveValue<object>
						| undefined;
					const own =
						layer === "base"
							? familyValue?.base
							: (familyValue?.overrides?.[layer] ?? undefined);
					// The node's own value still wins — the materialized
					// contribution goes underneath it.
					const merged = mergePropertyWise<object>(
						delta,
						own === null ? undefined : own,
					);
					const nextFamily: ResponsiveValue<object> = {
						...(familyValue ?? {}),
					};
					if (layer === "base") {
						(nextFamily as { base?: object }).base = merged;
					} else {
						(
							nextFamily as { overrides?: Record<string, object | null> }
						).overrides = {
							...(nextFamily.overrides ?? {}),
							[layer]: merged,
						};
					}
					nextRecord = { ...nextRecord };
					(nextRecord as unknown as Record<string, unknown>)[family] =
						nextFamily;
				}
			}

			nextRecord = withRefsAt(nextRecord, layer, remaining);
		}
		if (nextRecord !== record) {
			nextState = withRecord(nextState, nodeId, nextRecord);
		}
	}

	const styleDefinitions = { ...nextState.styleDefinitions };
	delete styleDefinitions[styleDefinitionId];
	return { ...nextState, styleDefinitions };
}
