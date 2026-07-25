/**
 * @file Compaction and normalization of authoring state
 * (PLAN-0020 CORE-P0-005F; DD-0019 §7.2).
 *
 * `compactAuthoringState` strips defaults, empties, `undefined`
 * values, and write-time `null` override entries — while preserving
 * ids, array order, object key order, and **every unknown key**
 * (older builds must round-trip newer documents losslessly). It is
 * pure: inputs are never mutated, and frozen inputs are safe.
 *
 * Structure-awareness matters: `null` is stripped **only** where the
 * contract defines it as a write-time removal signal
 * (`ResponsiveValue.overrides` entries); JSON `null` inside component
 * props, override props, token literals, and binding fallbacks is
 * real data and survives verbatim.
 */

import type {
	AuthoringStateV1,
	NodeAuthoringStateV1,
	ResponsiveValue,
} from "@anvilkit/contracts/editor";
import { normalizeBreakpointOrder } from "./responsive.js";

const RESPONSIVE_FAMILY_KEYS = [
	"hidden",
	"layout",
	"style",
	"typography",
	"styleRefs",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Drop `undefined`-valued keys; keep everything else (incl. unknown keys). */
function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
	let changed = false;
	const next: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (entry === undefined) {
			changed = true;
			continue;
		}
		next[key] = entry;
	}
	return (changed ? next : value) as T;
}

/** True when a spec-like object carries no own enumerable keys. */
function isEmptyObject(value: Record<string, unknown>): boolean {
	return Object.keys(value).length === 0;
}

/**
 * Compact one `ResponsiveValue`: remove `undefined` base, remove
 * `null` override entries (write-time removal signal), remove
 * override values that compact to empty objects, and collapse to
 * `undefined` when neither base nor overrides remain.
 */
export function compactResponsiveValue<T>(
	value: ResponsiveValue<T> | undefined,
): ResponsiveValue<T> | undefined {
	if (value === undefined) {
		return undefined;
	}
	// Reference preservation matters for the per-dispatch budget
	// (CORE-P0-015): an already-canonical value returns unchanged so
	// upstream compaction can short-circuit by identity.
	let changed = false;
	const result: Record<string, unknown> = { ...value };
	if (result.base === undefined) {
		if ("base" in value) {
			changed = true;
		}
		delete result.base;
	} else if (isPlainObject(result.base)) {
		const compactBase = withoutUndefined(result.base);
		if (isEmptyObject(compactBase)) {
			delete result.base;
			changed = true;
		} else if (compactBase !== result.base) {
			result.base = compactBase;
			changed = true;
		}
	}
	const overrides = value.overrides;
	if (overrides !== undefined) {
		let overridesChanged = false;
		const nextOverrides: Record<string, unknown> = {};
		for (const [breakpointId, override] of Object.entries(overrides)) {
			if (override === null || override === undefined) {
				overridesChanged = true;
				continue;
			}
			if (isPlainObject(override)) {
				const compactOverride = withoutUndefined(override);
				if (isEmptyObject(compactOverride)) {
					overridesChanged = true;
					continue;
				}
				if (compactOverride !== override) {
					overridesChanged = true;
				}
				nextOverrides[breakpointId] = compactOverride;
				continue;
			}
			nextOverrides[breakpointId] = override;
		}
		if (Object.keys(nextOverrides).length === 0) {
			delete result.overrides;
			changed = true;
		} else if (overridesChanged) {
			result.overrides = nextOverrides;
			changed = true;
		}
	}
	if (result.base === undefined && result.overrides === undefined) {
		// Unknown keys alone do not justify keeping the family: the
		// family is only addressable through base/overrides. Preserve
		// the object if any unknown key exists, else drop it.
		return isEmptyObject(withoutUndefined(result))
			? undefined
			: (result as ResponsiveValue<T>);
	}
	return changed ? (result as ResponsiveValue<T>) : value;
}

/**
 * Compact one node record. Returns `undefined` when nothing but the
 * `version` marker (and no unknown keys) remains — invariant 3 says
 * such records must not exist.
 */
export function compactNodeRecord(
	record: NodeAuthoringStateV1,
): NodeAuthoringStateV1 | undefined {
	let changed = false;
	const next: Record<string, unknown> = { ...record };
	for (const family of RESPONSIVE_FAMILY_KEYS) {
		const current = next[family] as ResponsiveValue<unknown> | undefined;
		const compacted = compactResponsiveValue(current);
		if (compacted === current) {
			if (current === undefined && family in next) {
				delete next[family];
				changed = true;
			}
			continue;
		}
		changed = true;
		if (compacted === undefined) {
			delete next[family];
		} else {
			next[family] = compacted;
		}
	}
	if (
		next.locked === false ||
		(next.locked === undefined && "locked" in next)
	) {
		delete next.locked;
		changed = true;
	}
	if (next.name === "" || (next.name === undefined && "name" in next)) {
		delete next.name;
		changed = true;
	}
	for (const refs of ["interactionRefs", "bindingRefs"] as const) {
		const list = next[refs];
		if (
			(list === undefined && refs in next) ||
			(Array.isArray(list) && list.length === 0)
		) {
			delete next[refs];
			changed = true;
		}
	}
	if (
		next.accessibility !== undefined &&
		isPlainObject(next.accessibility) &&
		isEmptyObject(withoutUndefined(next.accessibility))
	) {
		delete next.accessibility;
		changed = true;
	}
	const stripped = withoutUndefined(next);
	if (stripped !== next) {
		changed = true;
	}
	const compacted = stripped as unknown as NodeAuthoringStateV1;
	const keys = Object.keys(compacted).filter((key) => key !== "version");
	if (keys.length === 0) {
		return undefined;
	}
	return changed ? compacted : record;
}

/**
 * Compact a full authoring state (pure; unknown keys preserved at
 * every level; ids and order untouched).
 */
export function compactAuthoringState(
	state: AuthoringStateV1,
): AuthoringStateV1 {
	let nodesChanged = false;
	const nodes: Record<string, NodeAuthoringStateV1> = {};
	for (const [nodeId, record] of Object.entries(state.nodes)) {
		const compacted = compactNodeRecord(record);
		if (compacted === undefined) {
			nodesChanged = true;
			continue;
		}
		if (compacted !== record) {
			nodesChanged = true;
		}
		nodes[nodeId] = compacted;
	}
	const next: Record<string, unknown> = { ...state };
	if (nodesChanged) {
		next.nodes = nodes;
	}
	const stripped = withoutUndefined(next) as unknown as AuthoringStateV1;
	// Fully-canonical input returns by reference (per-dispatch budget).
	if (!nodesChanged && (stripped as unknown) === next) {
		return state;
	}
	return stripped;
}

/**
 * Canonical normalization: compaction plus breakpoint display-order
 * normalization (widest first). The result is the shape all writers
 * must persist (invariant 10).
 */
export function normalizeAuthoringState(
	state: AuthoringStateV1,
): AuthoringStateV1 {
	const compacted = compactAuthoringState(state);
	const breakpoints = normalizeBreakpointOrder(compacted.breakpoints);
	if (breakpoints === compacted.breakpoints) {
		return compacted;
	}
	let identical = breakpoints.length === compacted.breakpoints.length;
	if (identical) {
		for (let index = 0; index < breakpoints.length; index += 1) {
			if (breakpoints[index] !== compacted.breakpoints[index]) {
				identical = false;
				break;
			}
		}
	}
	return identical ? compacted : { ...compacted, breakpoints };
}
