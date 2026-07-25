"use client";

/**
 * @file Editable-target metadata resolution (PLAN-0020
 * CORE-P1B-009A; ED-TEXT-001; DD-0019 §17, §26.1 precedence row).
 *
 * `InlineTextTarget` declarations live on `metadata.editor.
 * capabilities.inlineText`. Resolution maps a declared target to its
 * DOM element inside a node's rendered subtree: an element stamped
 * `data-ak-text-target="<target id>"` when the component marks its
 * text regions, else the node's primary element (single-target
 * components need no extra markup).
 *
 * **Precedence (§26.1)**: explicit metadata beats the legacy
 * text-drop heuristic — a component that declares ANY inline text
 * target opts out of heuristic hit-testing entirely; undeclared
 * components keep today's heuristic behavior (the fallback is never
 * removed).
 */

import type {
	EditorCapabilityMetadata,
	InlineTextTarget,
} from "@anvilkit/contracts/editor";
import type { CanvasDomRegistry } from "../canvas/dom-registry.js";

/** The explicit text-region attribute components may stamp. */
export const TEXT_TARGET_ATTRIBUTE = "data-ak-text-target";

/** Declared inline-text targets of a component (empty when none). */
export function declaredTextTargets(
	metadata: EditorCapabilityMetadata | undefined,
): readonly InlineTextTarget[] {
	return metadata?.capabilities.inlineText ?? [];
}

/**
 * §26.1 precedence gate: true when explicit metadata suppresses the
 * legacy text-drop heuristic for this component.
 */
export function hasDeclaredTextTargets(
	metadata: EditorCapabilityMetadata | undefined,
): boolean {
	return declaredTextTargets(metadata).length > 0;
}

/** A declared target resolved to its live DOM element. */
export interface ResolvedTextTarget {
	readonly target: InlineTextTarget;
	readonly element: HTMLElement;
}

/**
 * Resolve a node's declared targets to elements. Targets whose
 * element is unmounted resolve away (Layers/inspector editing remains
 * available); a single declared target falls back to the node's
 * primary element when no explicit region is stamped.
 */
export function resolveTextTargets(
	nodeId: string,
	metadata: EditorCapabilityMetadata | undefined,
	registry: CanvasDomRegistry,
): readonly ResolvedTextTarget[] {
	const targets = declaredTextTargets(metadata);
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
 * The target under a pointer/double-click, if any: the closest
 * stamped region wins, else the node's single declared target.
 */
export function targetFromElement(
	element: Element,
	nodeId: string,
	metadata: EditorCapabilityMetadata | undefined,
	registry: CanvasDomRegistry,
): ResolvedTextTarget | null {
	const targets = declaredTextTargets(metadata);
	if (targets.length === 0) {
		return null;
	}
	const stamped = element.closest<HTMLElement>(`[${TEXT_TARGET_ATTRIBUTE}]`);
	if (stamped !== null) {
		const id = stamped.getAttribute(TEXT_TARGET_ATTRIBUTE);
		const target = targets.find((entry) => entry.id === id);
		return target === undefined ? null : { target, element: stamped };
	}
	const resolved = resolveTextTargets(nodeId, metadata, registry);
	return resolved[0] ?? null;
}
