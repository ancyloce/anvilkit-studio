export type OptionValue = string | number | boolean | undefined | null | object;

const OPTION_ID_PREFIX = "option:";

export function optionId(index: number): string {
	return `${OPTION_ID_PREFIX}${index}`;
}

export function optionIndexFromId(id: string): number | null {
	if (!id.startsWith(OPTION_ID_PREFIX)) return null;
	const index = Number(id.slice(OPTION_ID_PREFIX.length));
	return Number.isInteger(index) && index >= 0 ? index : null;
}

/**
 * Deterministic structural equality for Puck select/radio option
 * values. Primitives and same-reference objects short-circuit via
 * `Object.is`; otherwise arrays/plain objects are compared recursively
 * key-for-key. This is what lets a structurally-equal-but-deserialized
 * object value (persisted, remote, or collaborative data round-tripped
 * through JSON) still match its configured option after it is no longer
 * the same object reference.
 */
export function structuralEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (
		a === null ||
		b === null ||
		typeof a !== "object" ||
		typeof b !== "object"
	) {
		return false;
	}
	const aIsArray = Array.isArray(a);
	const bIsArray = Array.isArray(b);
	if (aIsArray || bIsArray) {
		if (!aIsArray || !bIsArray || a.length !== b.length) return false;
		for (let i = 0; i < a.length; i += 1) {
			if (!structuralEqual(a[i], b[i])) return false;
		}
		return true;
	}
	const aObj = a as Record<string, unknown>;
	const bObj = b as Record<string, unknown>;
	const aKeys = Object.keys(aObj);
	const bKeys = Object.keys(bObj);
	if (aKeys.length !== bKeys.length) return false;
	for (const key of aKeys) {
		if (!Object.hasOwn(bObj, key)) return false;
		if (!structuralEqual(aObj[key], bObj[key])) return false;
	}
	return true;
}

export function findOptionIndex(
	options: readonly { readonly value?: unknown }[],
	value: unknown,
): number {
	// `Object.is` fast-path keeps primitive/same-reference matching
	// allocation-free; structural fallback handles deserialized object
	// option values that are equal by shape but not by reference.
	return options.findIndex((option) => structuralEqual(option.value, value));
}
