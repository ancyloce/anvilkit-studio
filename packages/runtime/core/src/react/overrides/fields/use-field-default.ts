/**
 * @file `useFieldDefault()` — resolves a field's configured default
 * value for the reset affordance (DESIGN.md-aligned "modified state"
 * treatment).
 *
 * A default is considered reliable ONLY when:
 *
 * 1. the field is a top-level prop (`name` contains no `.` / `[` —
 *    array/object member paths have no per-member defaults), and
 * 2. the selected component's `ComponentConfig.defaultProps` (or
 *    `root.defaultProps` for the page root) has an OWN property for
 *    that name, and
 * 3. the default is a primitive (`string | number | boolean | null`)
 *    — primitives compare exactly with `Object.is`, so "modified"
 *    can never be a false positive. Object/array defaults get no
 *    reset affordance rather than a guessy deep comparison.
 *
 * Anything else returns {@link NO_DEFAULT}: no affordance is shown and
 * no value is ever invented (task rule: "do not infer defaults when
 * they are not available").
 */

import { useOptionalReactivePuck } from "@/overrides/utils/use-reactive-puck";

/** Sentinel: the field has no reliable configured default. */
export const NO_DEFAULT: unique symbol = Symbol("anvilkit.field.no-default");

export type FieldDefault = string | number | boolean | null;

function isPrimitiveDefault(value: unknown): value is FieldDefault {
	return (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
}

interface WithDefaultProps {
	readonly defaultProps?: Record<string, unknown>;
}

/**
 * Read the reliable configured default for a top-level field of the
 * selected component (or the page root when no item is selected).
 * Subscribes only to a stable projection — `defaultProps[name]` comes
 * from the static config, so unrelated Puck state changes never
 * re-render the caller.
 */
export function useFieldDefault(
	name: string | undefined,
): FieldDefault | typeof NO_DEFAULT {
	const topLevel =
		name !== undefined &&
		name.length > 0 &&
		!name.includes(".") &&
		!name.includes("[");

	// Optional variant: field renderers are always inside `<Puck>` in
	// production, but unit tests (and defensive hosts) may mount them
	// bare — the affordance then simply never appears.
	return useOptionalReactivePuck((s) => {
		if (!topLevel) return NO_DEFAULT;
		const item = s.selectedItem as { type?: string } | null;
		const owner =
			item !== null && typeof item.type === "string"
				? (s.config?.components?.[item.type] as WithDefaultProps | undefined)
				: (s.config?.root as WithDefaultProps | undefined);
		const defaults = owner?.defaultProps;
		if (
			defaults === undefined ||
			defaults === null ||
			!Object.hasOwn(defaults, name as string)
		) {
			return NO_DEFAULT;
		}
		const value = defaults[name as string];
		return isPrimitiveDefault(value) ? value : NO_DEFAULT;
	}, NO_DEFAULT);
}
