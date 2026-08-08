"use client";

/**
 * @file Editable-target resolution (PLAN-0028 `p4-007`; rebased from
 * PLAN-0020 CORE-P1B-009A).
 *
 * Resolution maps a **declared** `InlineTextTarget` to its DOM element
 * inside a node's rendered subtree: an element stamped
 * `data-ak-text-target="<target id>"` when the component marks its text
 * regions, else the node's primary element (single-target components
 * need no extra markup).
 *
 * **The declaration is no longer read here.** It arrives as
 * `DocumentNode.inlineText` from the read model — one projection of
 * `(appState.data, config)` shared with every other editor surface —
 * instead of being re-derived from an `AnvilComponentMetadata` handed in
 * by the capability registry. Two modules reading the declaration two
 * ways is exactly how an editor comes to offer an affordance whose
 * commit is rejected, so there is now one reader.
 *
 * An empty target list means the component declares no inline text.
 * Callers must then offer **no** affordance at all, not a disabled one:
 * `targetFromElement` returns `null` and double-click falls through to
 * drill-in, the same as on any non-text component.
 */

import type { InlineTextTarget } from "@anvilkit/contracts/editor";
import type { CanvasDomRegistry } from "../canvas/dom-registry.js";

/** The explicit text-region attribute components may stamp. */
export const TEXT_TARGET_ATTRIBUTE = "data-ak-text-target";

/** A declared target resolved to its live DOM element. */
export interface ResolvedTextTarget {
	readonly target: InlineTextTarget;
	readonly element: HTMLElement;
}

/**
 * Resolve a node's declared targets to elements. Targets whose element
 * is unmounted resolve away (inspector editing remains available); a
 * single declared target falls back to the node's primary element when
 * no explicit region is stamped.
 */
export function resolveTextTargets(
	nodeId: string,
	targets: readonly InlineTextTarget[],
	registry: CanvasDomRegistry,
): readonly ResolvedTextTarget[] {
	if (targets.length === 0) {
		return [];
	}
	const host = registry.getPrimaryElement(nodeId);
	if (host === null) {
		return [];
	}
	const resolved: ResolvedTextTarget[] = [];
	for (const target of targets) {
		const explicit = host.querySelector<HTMLElement>(
			`[${TEXT_TARGET_ATTRIBUTE}="${target.id}"]`,
		);
		if (explicit !== null) {
			resolved.push({ target, element: explicit });
			continue;
		}
		if (targets.length === 1) {
			resolved.push({ target, element: host });
		}
	}
	return resolved;
}

/**
 * The target under a pointer/double-click, if any: the closest stamped
 * region wins, else the node's single declared target.
 */
export function targetFromElement(
	element: Element,
	nodeId: string,
	targets: readonly InlineTextTarget[],
	registry: CanvasDomRegistry,
): ResolvedTextTarget | null {
	if (targets.length === 0) {
		return null;
	}
	const stamped = element.closest<HTMLElement>(`[${TEXT_TARGET_ATTRIBUTE}]`);
	if (stamped !== null) {
		const id = stamped.getAttribute(TEXT_TARGET_ATTRIBUTE);
		const target = targets.find((entry) => entry.id === id);
		return target === undefined ? null : { target, element: stamped };
	}
	const resolved = resolveTextTargets(nodeId, targets, registry);
	return resolved[0] ?? null;
}
