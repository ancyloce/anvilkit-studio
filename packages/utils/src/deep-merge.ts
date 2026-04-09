/**
 * Recursive `Partial<T>` that descends into nested objects while
 * leaving array element types alone. Used by `deepMerge` to accept
 * layered config patches.
 */
export type DeepPartial<T> = T extends ReadonlyArray<infer _U>
	? T
	: T extends object
		? { [K in keyof T]?: DeepPartial<T[K]> }
		: T;

/**
 * Keys that must never be assigned through `deepMerge` to avoid
 * prototype-pollution gadgets like `JSON.parse('{"__proto__":{…}}')`.
 */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Deeply merges one or more `sources` onto `target`, returning a **new**
 * object. The original `target` is never mutated — callers can treat the
 * result as an immutable snapshot.
 *
 * Semantics:
 *
 * - Later sources override earlier sources (total order).
 * - Plain objects are merged recursively.
 * - **Arrays are replaced, not concatenated.** This is the correct
 *   behavior for layered configuration (you want Layer 3 to fully
 *   override Layer 1's array, not append to it). Other Puck-adjacent
 *   codebases have regressed here; do not change it without updating
 *   every caller.
 * - Non-plain objects (class instances, `Date`, `Map`, `Set`, etc.) are
 *   assigned by reference — they are leaf values.
 * - Own-property keys `__proto__`, `constructor`, and `prototype` are
 *   silently skipped to block prototype-pollution attacks.
 *
 * @param target - The base value. If it is a plain object, it is
 *   shallow-cloned before merging.
 * @param sources - Patches applied in order. `undefined` sources are
 *   ignored so callers can pass optional layers without guarding.
 * @returns A new `T` containing the merged result.
 *
 * @example
 * deepMerge(
 *   { theme: { mode: "light", tokens: { primary: "#000" } } },
 *   { theme: { mode: "dark" } },
 * );
 * // => { theme: { mode: "dark", tokens: { primary: "#000" } } }
 *
 * @example
 * deepMerge({ tags: ["a", "b"] }, { tags: ["c"] });
 * // => { tags: ["c"] }   // arrays are replaced, not merged
 */
export function deepMerge<T>(
	target: T,
	...sources: ReadonlyArray<DeepPartial<T> | undefined>
): T {
	let result: unknown = isPlainObject(target) ? { ...target } : target;
	for (const source of sources) {
		if (source === undefined) continue;
		result = mergeInto(result, source);
	}
	return result as T;
}

function mergeInto(target: unknown, source: unknown): unknown {
	if (!isPlainObject(source)) {
		return source;
	}
	const base: Record<string, unknown> = isPlainObject(target)
		? { ...target }
		: {};
	for (const key of Object.keys(source)) {
		if (FORBIDDEN_KEYS.has(key)) continue;
		const sourceValue = source[key];
		const targetValue = base[key];
		if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
			base[key] = mergeInto(targetValue, sourceValue);
		} else {
			base[key] = sourceValue;
		}
	}
	return base;
}

/**
 * Narrow plain-object check. Returns `false` for `null`, arrays, class
 * instances, and any value whose prototype is not `Object.prototype` or
 * `null` (the latter accommodates `Object.create(null)` records).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object") return false;
	const proto = Object.getPrototypeOf(value);
	return proto === null || proto === Object.prototype;
}
