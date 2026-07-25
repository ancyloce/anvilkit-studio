/**
 * @file Property-wise partial merging (PLAN-0020 CORE-P0-010;
 * DD-0019 §11.3, §24.3).
 *
 * Later arguments win **per property**; a higher-level partial never
 * erases unrelated lower-level properties. Nested plain objects
 * (box edges, border specs, filters) merge recursively; typed values
 * (`kind`/`type`-discriminated), arrays, and primitives replace
 * wholesale.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAtomicValueObject(value: Record<string, unknown>): boolean {
	return typeof value.kind === "string" || typeof value.type === "string";
}

function mergeTwo(base: unknown, override: unknown): unknown {
	if (override === undefined) {
		return base;
	}
	if (
		isPlainObject(base) &&
		isPlainObject(override) &&
		!isAtomicValueObject(base) &&
		!isAtomicValueObject(override)
	) {
		const next: Record<string, unknown> = { ...base };
		for (const [key, entry] of Object.entries(override)) {
			if (entry === undefined) {
				continue;
			}
			next[key] = mergeTwo(next[key], entry);
		}
		return next;
	}
	return override;
}

/**
 * Merge partial spec layers, lowest precedence first (DD-0019 §24.3:
 * component default → style definitions in order → node values).
 * `undefined` and `null` layers are skipped. Pure.
 */
export function mergePropertyWise<T extends object>(
	...layers: ReadonlyArray<Partial<T> | undefined | null>
): Partial<T> {
	let result: unknown = {};
	for (const layer of layers) {
		if (layer === undefined || layer === null) {
			continue;
		}
		result = mergeTwo(result, layer);
	}
	return result as Partial<T>;
}
