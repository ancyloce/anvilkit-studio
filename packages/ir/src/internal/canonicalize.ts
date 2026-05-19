/**
 * Pure helpers for normalizing Puck props into the canonical IR form.
 *
 * - Alphabetical key sort
 * - `undefined` values stripped
 * - `Date` instances coerced to ISO strings
 * - Function and other non-JSON values dropped (caller handles warnings)
 *
 * @internal — not part of the public `@anvilkit/ir` surface.
 */

import { MAX_TREE_DEPTH } from "./types.js";

/**
 * Returns `true` if `value` is a function (arrow, method, constructor).
 */
function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
	return typeof value === "function";
}

const OMIT = Symbol("canonicalize.omit");

/**
 * Narrowing guard for the {@link OMIT} sentinel. Used instead of a
 * `unknown | typeof OMIT` union (which collapses to `unknown` and
 * erases the brand) so callers are type-narrowed at every guard.
 */
function isOmit(value: unknown): value is typeof OMIT {
	return value === OMIT;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function appendObjectPath(parent: string, key: string): string {
	return parent.length === 0 ? key : `${parent}.${key}`;
}

function appendArrayPath(parent: string, index: number): string {
	return `${parent}[${index}]`;
}

function canonicalizeValue(
	value: unknown,
	path: string,
	droppedFunctions: string[],
	droppedCircularRefs: string[],
	droppedUnsupportedValues: string[],
	ancestors: WeakSet<object>,
	depth: number,
): unknown {
	if (value === undefined) return OMIT;

	if (isFunction(value)) {
		droppedFunctions.push(path);
		return OMIT;
	}

	if (typeof value === "symbol" || typeof value === "bigint") {
		droppedUnsupportedValues.push(path);
		return OMIT;
	}

	// Truncate pathologically deep prop trees rather than overflow
	// the stack; the dropped path surfaces as a serialization warning.
	if (depth > MAX_TREE_DEPTH) {
		droppedUnsupportedValues.push(path);
		return OMIT;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (Array.isArray(value)) {
		if (ancestors.has(value)) {
			droppedCircularRefs.push(path);
			return OMIT;
		}

		ancestors.add(value);
		const result: unknown[] = [];

		for (let index = 0; index < value.length; index += 1) {
			const canonical = canonicalizeValue(
				value[index],
				appendArrayPath(path, index),
				droppedFunctions,
				droppedCircularRefs,
				droppedUnsupportedValues,
				ancestors,
				depth + 1,
			);

			if (!isOmit(canonical)) {
				result.push(canonical);
			}
		}

		ancestors.delete(value);
		return result;
	}

	if (isObject(value)) {
		if (ancestors.has(value)) {
			droppedCircularRefs.push(path);
			return OMIT;
		}

		ancestors.add(value);
		const result: Record<string, unknown> = {};

		for (const key of Object.keys(value).sort()) {
			const canonical = canonicalizeValue(
				value[key],
				appendObjectPath(path, key),
				droppedFunctions,
				droppedCircularRefs,
				droppedUnsupportedValues,
				ancestors,
				depth + 1,
			);

			if (!isOmit(canonical)) {
				result[key] = canonical;
			}
		}

		ancestors.delete(value);
		return result;
	}

	return value;
}

/**
 * Canonicalize a props bag:
 *
 * 1. Sort object keys alphabetically at every level.
 * 2. Strip `undefined` values.
 * 3. Coerce `Date` → ISO string.
 * 4. Drop function and non-JSON values (returns dropped paths).
 * 5. Guard circular references.
 *
 * Does **not** mutate the input.
 */
export function canonicalizeProps(raw: Record<string, unknown>): {
	props: Readonly<Record<string, unknown>>;
	droppedFunctions: readonly string[];
	droppedCircularRefs: readonly string[];
	droppedUnsupportedValues: readonly string[];
} {
	const sorted: Record<string, unknown> = {};
	const droppedFunctions: string[] = [];
	const droppedCircularRefs: string[] = [];
	const droppedUnsupportedValues: string[] = [];
	const ancestors = new WeakSet<object>();

	for (const key of Object.keys(raw).sort()) {
		const canonical = canonicalizeValue(
			raw[key],
			key,
			droppedFunctions,
			droppedCircularRefs,
			droppedUnsupportedValues,
			ancestors,
			0,
		);

		if (!isOmit(canonical)) {
			sorted[key] = canonical;
		}
	}

	return {
		props: sorted,
		droppedFunctions,
		droppedCircularRefs,
		droppedUnsupportedValues,
	};
}

/**
 * Recursively freeze an object and every nested object / array.
 * Primitives and already-frozen values are skipped.
 */
export function deepFreeze<T>(obj: T): T {
	freezeWithDepth(obj, 0);
	return obj;
}

function freezeWithDepth(obj: unknown, depth: number): void {
	if (obj === null || typeof obj !== "object") return;
	if (Object.isFrozen(obj)) return;
	// Stop past the depth cap rather than overflow; truncation only
	// leaves the deepest nodes unfrozen, which is safe.
	if (depth > MAX_TREE_DEPTH) return;

	Object.freeze(obj);

	for (const value of Object.values(obj as Record<string, unknown>)) {
		if (
			value !== null &&
			typeof value === "object" &&
			!Object.isFrozen(value)
		) {
			freezeWithDepth(value, depth + 1);
		}
	}
}
