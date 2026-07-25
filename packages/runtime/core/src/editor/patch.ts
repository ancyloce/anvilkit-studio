/**
 * @file `EditorPatch` application (PLAN-0020 CORE-P0-008; contract
 * freeze CORE-P0-001 D-8).
 *
 * A patch property set to `null` removes the property at the
 * addressed layer; nested plain-object patches recurse; every other
 * value replaces wholesale (typed CSS values, arrays, and unions are
 * atomic). `null` never survives into produced state.
 */

import type { EditorPatch } from "@anvilkit/contracts/editor";

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) !== null
	);
}

/**
 * A typed-value object (discriminated by `kind` or `type`) is atomic:
 * patching inside a `CssLength` or `Paint` is not meaningful — the
 * whole value is replaced.
 */
function isAtomicValueObject(value: Record<string, unknown>): boolean {
	return typeof value.kind === "string" || typeof value.type === "string";
}

/**
 * Apply an {@link EditorPatch} to a spec object. Pure; returns the
 * input object unchanged (same reference) when the patch is a no-op.
 */
export function applyEditorPatch<T extends object>(
	target: T | undefined,
	patch: EditorPatch<T>,
): T | undefined {
	const base: Record<string, unknown> = { ...(target ?? {}) };
	let changed = false;
	for (const [key, entry] of Object.entries(patch as Record<string, unknown>)) {
		if (entry === undefined) {
			continue;
		}
		if (entry === null) {
			if (key in base) {
				delete base[key];
				changed = true;
			}
			continue;
		}
		const current = base[key];
		if (
			isPlainObject(entry) &&
			!isAtomicValueObject(entry) &&
			(current === undefined || isPlainObject(current))
		) {
			const next = applyEditorPatch(
				(current as object | undefined) ?? {},
				entry as EditorPatch<object>,
			);
			if (next === undefined || Object.keys(next).length === 0) {
				if (key in base) {
					delete base[key];
					changed = true;
				}
				continue;
			}
			if (current === undefined || next !== current) {
				if (!shallowEqualObjects(current, next)) {
					base[key] = next;
					changed = true;
				}
			}
			continue;
		}
		if (!deepEqualJson(current, entry)) {
			base[key] = entry;
			changed = true;
		}
	}
	if (!changed && target !== undefined) {
		return target;
	}
	if (Object.keys(base).length === 0) {
		return undefined;
	}
	return base as T;
}

function shallowEqualObjects(a: unknown, b: unknown): boolean {
	if (a === b) {
		return true;
	}
	if (!isPlainObject(a) || !isPlainObject(b)) {
		return false;
	}
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) {
		return false;
	}
	return aKeys.every((key) => a[key] === b[key]);
}

/** Structural equality over JSON-safe values (order-insensitive keys). */
export function deepEqualJson(a: unknown, b: unknown): boolean {
	if (a === b) {
		return true;
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		return (
			a.length === b.length &&
			a.every((entry, index) => deepEqualJson(entry, b[index]))
		);
	}
	if (isPlainObject(a) && isPlainObject(b)) {
		const aKeys = Object.keys(a).filter((key) => a[key] !== undefined);
		const bKeys = Object.keys(b).filter((key) => b[key] !== undefined);
		if (aKeys.length !== bKeys.length) {
			return false;
		}
		return aKeys.every((key) => deepEqualJson(a[key], b[key]));
	}
	return false;
}

/**
 * Remove `null` leaves from a patch, producing a plain partial that
 * the domain schemas can validate (`EDITOR_INVALID_CSS_VALUE`
 * mapping happens on the validation side).
 */
export function stripPatchNulls(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value;
	}
	if (isPlainObject(value)) {
		if (isAtomicValueObject(value)) {
			// Typed values (`kind`/`type` discriminated) are atomic — never
			// treated as patch trees, JSON nulls inside them are real data.
			return value;
		}
		const next: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value)) {
			if (entry === null || entry === undefined) {
				continue;
			}
			next[key] = stripPatchNulls(entry);
		}
		return next;
	}
	return value;
}
