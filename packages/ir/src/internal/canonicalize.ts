/**
 * Pure helpers for normalizing Puck props into the canonical IR form.
 *
 * - Alphabetical key sort
 * - `undefined` values stripped
 * - `Date` instances coerced to ISO strings
 * - Function values dropped (caller handles the warning)
 *
 * @internal — not part of the public `@anvilkit/ir` surface.
 */

/**
 * Returns `true` if `value` is a function (arrow, method, constructor).
 */
function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
	return typeof value === "function";
}

/**
 * Canonicalize a props bag:
 *
 * 1. Sort keys alphabetically.
 * 2. Strip `undefined` values.
 * 3. Coerce `Date` → ISO string.
 * 4. Drop function values (returns the dropped key names).
 *
 * Does **not** mutate the input.
 */
export function canonicalizeProps(raw: Record<string, unknown>): {
	props: Readonly<Record<string, unknown>>;
	droppedFunctions: readonly string[];
} {
	const sorted: Record<string, unknown> = {};
	const droppedFunctions: string[] = [];

	for (const key of Object.keys(raw).sort()) {
		const value = raw[key];

		if (value === undefined) continue;

		if (isFunction(value)) {
			droppedFunctions.push(key);
			continue;
		}

		if (value instanceof Date) {
			sorted[key] = value.toISOString();
			continue;
		}

		sorted[key] = value;
	}

	return { props: sorted, droppedFunctions };
}

/**
 * Recursively freeze an object and every nested object / array.
 * Primitives and already-frozen values are skipped.
 */
export function deepFreeze<T>(obj: T): T {
	if (obj === null || typeof obj !== "object") return obj;
	if (Object.isFrozen(obj)) return obj;

	Object.freeze(obj);

	for (const value of Object.values(obj as Record<string, unknown>)) {
		if (
			value !== null &&
			typeof value === "object" &&
			!Object.isFrozen(value)
		) {
			deepFreeze(value);
		}
	}

	return obj;
}
