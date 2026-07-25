/**
 * @file Responsive value resolution (PLAN-0020 CORE-P0-010; DD-0019
 * §12.3, §24.3).
 *
 * Desktop-first: for viewport width `w`, start with base, take all
 * enabled breakpoints where `w <= maxWidth`, merge them widest →
 * narrowest, and let the narrowest match win. `null` entries clear
 * the local override and resume inheritance (treated as absent).
 */

import type {
	BreakpointDefinition,
	ResolvedValue,
	ResponsiveValue,
} from "@anvilkit/contracts/editor";

/**
 * The enabled breakpoints matching a viewport width, ordered widest
 * to narrowest (the §12.3 merge order).
 */
export function getMatchingBreakpoints(
	breakpoints: readonly BreakpointDefinition[],
	viewportWidth: number,
): readonly BreakpointDefinition[] {
	return breakpoints
		.filter(
			(breakpoint) =>
				breakpoint.enabled && viewportWidth <= breakpoint.maxWidth,
		)
		.sort((a, b) => b.maxWidth - a.maxWidth);
}

/**
 * Resolve a `ResponsiveValue` at a viewport width (DD-0019 §12.3,
 * verbatim signature). `merge` folds each matching override onto the
 * accumulated value — property-wise for spec objects, replacement
 * for scalars.
 *
 * `source` is the narrowest matching layer that contributed a value;
 * `inherited` is true when the narrowest matching breakpoint itself
 * contributed nothing (the value flows down from a wider layer or
 * base).
 */
export function resolveResponsiveValue<T>(
	input: ResponsiveValue<T> | undefined,
	breakpoints: readonly BreakpointDefinition[],
	viewportWidth: number,
	merge: (base: T | undefined, override: T) => T,
): ResolvedValue<T> {
	const matching = getMatchingBreakpoints(breakpoints, viewportWidth);
	const narrowestId = matching.at(-1)?.id;
	if (input === undefined) {
		return { value: undefined, source: "default", inherited: false };
	}
	let value: T | undefined = input.base;
	let source: ResolvedValue<T>["source"] =
		input.base !== undefined ? "base" : "default";
	for (const breakpoint of matching) {
		const override = input.overrides?.[breakpoint.id];
		if (override === undefined || override === null) {
			continue;
		}
		value = merge(value, override);
		source = breakpoint.id;
	}
	const inherited = narrowestId !== undefined ? source !== narrowestId : false;
	return { value, source, inherited };
}
