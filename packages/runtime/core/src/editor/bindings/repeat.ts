/**
 * @file Repeater render contexts and visibility resolution
 * (PLAN-0020 CORE-P3-006; ED-BIND-002; DD-0019 §19).
 *
 * §19: "Repeaters create render contexts rather than durable duplicate
 * Puck nodes and require a stable item key for production export."
 *
 * ### Render contexts, not nodes
 *
 * A repeat binding never writes nodes into the document. It produces
 * the *scopes* a subtree is rendered under — one `{item, index, key}`
 * per record. That is what keeps a 50-row preview from turning into 50
 * undoable node insertions, and it is why this module returns data
 * instead of a Puck tree: there is no code path here that could
 * accidentally persist a row.
 *
 * ### Where the "stable item key" comes from
 *
 * `BindingTarget.repeat` carries `itemName` and `limit` — **no key
 * field**. So the key is derived from the record itself: the first
 * present, scalar, non-empty field from {@link ITEM_KEY_FIELDS}. When
 * a record offers none, the context falls back to its index and is
 * marked `keySource: "index"`.
 *
 * Index keys are correct for rendering but not *stable*: reordering
 * the source data silently re-associates every row with different
 * content, so a production export built on them would drift from what
 * the author previewed. That is why §19 requires a stable key for
 * production export specifically — {@link repeatExportBlockers}
 * reports the offending bindings, and the export preflight blocks on
 * them while the editor keeps previewing happily.
 */

import type {
	Binding,
	JsonValue,
	SafeCondition,
} from "@anvilkit/contracts/editor";
import { type BindingScope, evaluateExpression } from "./evaluate.js";

/**
 * Record fields accepted as a stable identity, in priority order.
 * Deliberately short and conventional — guessing more widely would
 * make the key silently depend on incidental field names.
 */
export const ITEM_KEY_FIELDS: readonly string[] = [
	"id",
	"_id",
	"uuid",
	"key",
	"slug",
];

/** One rendering scope produced by a repeat binding. */
export interface RepeatContext {
	readonly item: JsonValue;
	readonly index: number;
	/** React-style key for this row. */
	readonly key: string;
	/** Whether {@link key} came from the record or from its position. */
	readonly keySource: "field" | "index";
}

/** The result of expanding one repeat binding. */
export interface RepeatExpansion {
	readonly contexts: readonly RepeatContext[];
	/** True when any context fell back to index keying. */
	readonly indexKeyed: boolean;
}

/**
 * Read a stable key off one record, or `undefined` when it offers no
 * usable identity.
 *
 * Only own enumerable scalars count. Objects and arrays are rejected
 * rather than stringified: `JSON.stringify` of a record is a content
 * hash, not an identity, so two rows that happen to match would
 * collide and an edit to one row would change its key.
 */
export function itemKeyOf(item: JsonValue): string | undefined {
	if (typeof item !== "object" || item === null || Array.isArray(item)) {
		return undefined;
	}
	for (const field of ITEM_KEY_FIELDS) {
		if (!Object.hasOwn(item, field)) continue;
		const value = (item as Record<string, JsonValue>)[field];
		if (typeof value === "string" && value !== "") return value;
		if (typeof value === "number" && Number.isFinite(value)) {
			return String(value);
		}
	}
	return undefined;
}

/**
 * Expand repeat data into render contexts.
 *
 * A non-array payload yields no contexts: repeating over an object is
 * not meaningful, and inventing a single-element repeat would hide the
 * author's mistake rather than surface it.
 */
export function buildRepeatContexts(
	data: JsonValue,
	limit: number,
): RepeatExpansion {
	if (!Array.isArray(data)) return EMPTY_EXPANSION;

	const contexts: RepeatContext[] = [];
	let indexKeyed = false;
	const rows = data.slice(0, Math.max(0, limit));

	rows.forEach((item, index) => {
		const field = itemKeyOf(item);
		if (field === undefined) indexKeyed = true;
		contexts.push({
			item,
			index,
			key: field ?? String(index),
			keySource: field === undefined ? "index" : "field",
		});
	});

	return { contexts, indexKeyed };
}

const EMPTY_EXPANSION: RepeatExpansion = { contexts: [], indexKeyed: false };

/** How a visibility binding resolved for one node. */
export type VisibilityResolution =
	/** The condition held (or no condition applies). */
	| { readonly status: "visible" }
	/** The condition did not hold. */
	| { readonly status: "hidden" }
	/**
	 * The condition could not be evaluated — a missing path, or an
	 * expression the evaluator refused.
	 */
	| { readonly status: "indeterminate"; readonly reason: string };

/**
 * Resolve a visibility condition.
 *
 * The three-way result exists because design mode must not lie. A node
 * whose binding cannot be evaluated is **not** the same as one the
 * author hid: the editor renders it as a placeholder so the element
 * stays selectable and repairable, whereas silently hiding it would
 * make the node vanish from the canvas with no way to get it back.
 * {@link isVisibleInDesign} encodes that choice.
 */
export function resolveVisibility(
	condition: SafeCondition,
	scope: BindingScope,
): VisibilityResolution {
	const result = evaluateExpression(condition, scope);
	if (result.status === "rejected") {
		return { status: "indeterminate", reason: result.reason };
	}
	if (result.status === "missing") {
		return { status: "indeterminate", reason: "missing" };
	}
	return truthy(result.value) ? { status: "visible" } : { status: "hidden" };
}

/**
 * Whether a node renders on the design canvas.
 *
 * Design mode shows hidden and indeterminate nodes alike — an author
 * cannot edit what they cannot select — so this is `true` except where
 * a caller explicitly asks for preview semantics.
 */
export function isVisibleInDesign(): boolean {
	return true;
}

/** Whether a node renders in preview/production for a resolution. */
export function isVisibleInPreview(resolution: VisibilityResolution): boolean {
	// Indeterminate resolves to visible: hiding content because a data
	// source hiccuped loses information, while showing it is merely
	// unfiltered. §25's placeholder convention makes the same trade.
	return resolution.status !== "hidden";
}

/**
 * Bindings that cannot be exported to production because their rows
 * would be keyed by position.
 *
 * Returns binding ids, so the export preflight can name them without
 * this module knowing anything about export.
 */
export function repeatExportBlockers(
	bindings: Readonly<Record<string, Binding>>,
	expansions: ReadonlyMap<string, RepeatExpansion>,
): readonly string[] {
	const blocked: string[] = [];
	for (const [bindingId, binding] of Object.entries(bindings)) {
		if (binding.target.type !== "repeat") continue;
		const expansion = expansions.get(bindingId);
		// An unexpanded repeat is not yet provably stable; it is only
		// blocked once we have seen data that keys by index.
		if (expansion?.indexKeyed === true) blocked.push(bindingId);
	}
	return blocked;
}

function truthy(value: JsonValue): boolean {
	if (value === null) return false;
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
	if (typeof value === "string") return value.length > 0;
	return true;
}
