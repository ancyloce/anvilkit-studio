/**
 * @file PLAN-0025 §6.2 — stable DOM target-attribute helpers.
 *
 * The public protocol between component render functions and the
 * appearance compiler: components emit these attributes from their
 * OFFICIAL Puck render function (never from an editor-only wrapper),
 * and compiled rules select on the escaped, exact attribute pair
 * `[data-ak-style-node="<id>"][data-ak-style-target="<target>"]`.
 * Descendant selectors are prohibited — they can accidentally match
 * targets of nested Puck components (plan §6.2).
 *
 * React-free on purpose: usable from RSC render paths, exporters, and
 * tests without a DOM.
 */

/** Attribute set for a component's root target (selection + styling). */
export function anvilRootAttrs(
	id: string,
	target = "root",
): Readonly<Record<string, string>> {
	return {
		"data-ak-node": id,
		"data-ak-style-node": id,
		"data-ak-style-target": target,
	} as const;
}

/** Attribute set for a named non-root target inside a component. */
export function anvilTargetAttrs(
	id: string,
	target: string,
): Readonly<Record<string, string>> {
	return {
		"data-ak-style-node": id,
		"data-ak-style-target": target,
	} as const;
}
