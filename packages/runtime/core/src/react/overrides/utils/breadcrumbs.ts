/**
 * @file `useBreadcrumbs()` — derives the selection breadcrumb chain
 * from Puck's live state.
 *
 * The fields panel renders a breadcrumb trail like
 * `Root > Section > Hero` so users can step back up the parent
 * hierarchy without losing context. Puck publishes `itemSelector`
 * (the active selection) and the full zone graph; this hook walks
 * the parent chain from the active node back to the root and
 * returns one descriptor per ancestor — including intermediate
 * ancestors for selections nested inside DropZones (`data.zones`,
 * keyed `parentId:zoneName`) and slot fields (content arrays stored
 * on the parent item's own props).
 *
 * Labels resolve through `config.components[type].label` (the same
 * display name the layer tree and canvas overlay show) and fall back
 * to the raw component type.
 */

import { useMemo } from "react";
import { useReactivePuck } from "./use-reactive-puck";

/**
 * One row in the breadcrumb chain. `id` is the Puck item id (or
 * `"root"` for the page root), `label` is what the UI renders, and
 * `type` is the raw component type (`undefined` for the root entry)
 * so callers can resolve per-component presentation like icons.
 */
export interface BreadcrumbEntry {
	readonly id: string;
	readonly label: string;
	readonly type?: string;
}

// Sentinels for the reactive descriptor selector. Empty string = nothing
// selected (empty chain). The NUL marker = a selection that resolves to no
// concrete item (root-only chain). A resolved selection encodes
// `<id>\u001f<type>\u001f<label>` per ancestor, ancestors joined by the
// record separator; the unit/record separators cannot appear in a Puck id
// or type.
const SELECTION_NONE = "";
const SELECTION_ROOT_ONLY = "\u0000";
const FIELD_SEP = "\u001f";
const RECORD_SEP = "\u001e";

interface ItemLike {
	readonly type?: unknown;
	readonly props?: { readonly id?: unknown } & Record<string, unknown>;
}

interface DataLike {
	readonly content?: readonly ItemLike[];
	readonly zones?: Readonly<Record<string, readonly ItemLike[]>>;
}

function isItemLike(value: unknown): value is ItemLike {
	if (value === null || typeof value !== "object") return false;
	const item = value as ItemLike;
	return (
		typeof item.type === "string" &&
		item.props !== null &&
		typeof item.props === "object" &&
		typeof item.props.id === "string"
	);
}

/**
 * Whether a prop value looks like a slot's content array (Puck 0.22
 * stores slot children as `ComponentData[]` directly on the parent's
 * props). Empty arrays are skipped — they contain nothing to index.
 */
function isContentArray(value: unknown): value is readonly ItemLike[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every((e) => isItemLike(e))
	);
}

/** Zone keys that mean "the page root's own content". */
function isRootZone(zone: string | undefined): boolean {
	return (
		zone === undefined ||
		zone === "default-zone" ||
		zone === "root:default-zone"
	);
}

interface IndexedItem {
	readonly item: ItemLike;
	/** Compound key of the container the item sits in. */
	readonly zone: string;
}

/**
 * Index every item in the document by id, remembering which container
 * (root content, named zone, or slot array) it lives in. O(n) over the
 * document per selector run; the selector output is a primitive
 * fingerprint, so unrelated Puck state changes never cause re-renders.
 */
function indexItems(data: DataLike): ReadonlyMap<string, IndexedItem> {
	const index = new Map<string, IndexedItem>();

	const visit = (content: readonly ItemLike[], zone: string): void => {
		for (const item of content) {
			if (!isItemLike(item)) continue;
			const id = item.props?.id as string;
			if (!index.has(id)) index.set(id, { item, zone });
			for (const [propName, propValue] of Object.entries(item.props ?? {})) {
				if (isContentArray(propValue)) {
					visit(propValue, `${id}:${propName}`);
				}
			}
		}
	};

	visit(data.content ?? [], "root:default-zone");
	for (const [zone, content] of Object.entries(data.zones ?? {})) {
		if (Array.isArray(content)) visit(content, zone);
	}
	return index;
}

function containerFor(
	data: DataLike,
	index: ReadonlyMap<string, IndexedItem>,
	zone: string | undefined,
): readonly ItemLike[] | undefined {
	if (isRootZone(zone)) return data.content;
	const named = data.zones?.[zone as string];
	if (named !== undefined) return named;
	// Slot content: `parentId:slotName` where the array lives on the
	// parent item's props.
	const sep = (zone as string).lastIndexOf(":");
	if (sep === -1) return undefined;
	const parent = index.get((zone as string).slice(0, sep));
	const slotValue = parent?.item.props?.[(zone as string).slice(sep + 1)];
	return isContentArray(slotValue) ? slotValue : undefined;
}

/**
 * Walk from the currently selected item to the root, returning a
 * top-down chain. The root is always entry zero, the active item
 * is always the last entry.
 *
 * Returns `[]` when nothing is selected — callers can then render
 * a placeholder or skip the breadcrumbs row entirely.
 */
export function useBreadcrumbs(): readonly BreadcrumbEntry[] {
	// Subscribe to a primitive fingerprint of the *resolved* chain, NOT the
	// whole `appState.data` object. Puck swaps `data` by reference on every
	// edit (including prop-only edits that leave the breadcrumb unchanged),
	// so a `s.appState.data` subscription would re-render on every
	// keystroke. Projecting the encoded chain string means the hook
	// re-renders only when the chain it would render actually changes.
	const descriptor = useReactivePuck((s) => {
		const sel = s.appState.ui.itemSelector;
		if (sel === null) {
			return SELECTION_NONE;
		}
		const data = s.appState.data as DataLike;
		const index = indexItems(data);
		const item = containerFor(data, index, sel.zone)?.[sel.index];
		if (item === undefined || !isItemLike(item)) {
			return SELECTION_ROOT_ONLY;
		}

		// `?.` — the snapshot's `config` is always present in production,
		// but partial test mocks may omit it; label resolution degrades to
		// the raw type instead of crashing the selector.
		const components = s.config?.components as
			| Record<string, { label?: string } | undefined>
			| undefined;
		const records: string[] = [];
		let current: IndexedItem | undefined = {
			item,
			zone: sel.zone ?? "root:default-zone",
		};
		// Bounded walk — a malformed zone graph (cycle via a stale id)
		// terminates instead of hanging the selector.
		for (let depth = 0; current !== undefined && depth < 64; depth += 1) {
			const id = current.item.props?.id as string;
			const type = current.item.type as string;
			const label = components?.[type]?.label ?? type;
			records.unshift(`${id}${FIELD_SEP}${type}${FIELD_SEP}${label}`);
			if (isRootZone(current.zone)) break;
			const sep = current.zone.lastIndexOf(":");
			current = sep === -1 ? undefined : index.get(current.zone.slice(0, sep));
		}
		return records.join(RECORD_SEP);
	});

	return useMemo(() => {
		if (descriptor === SELECTION_NONE) {
			return [];
		}
		const chain: BreadcrumbEntry[] = [{ id: "root", label: "Root" }];
		if (descriptor === SELECTION_ROOT_ONLY) {
			return chain;
		}
		for (const record of descriptor.split(RECORD_SEP)) {
			const [id = "", type = "", label = ""] = record.split(FIELD_SEP);
			chain.push({ id, label: label.length > 0 ? label : type, type });
		}
		return chain;
	}, [descriptor]);
}
