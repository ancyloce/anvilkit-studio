"use client";

/**
 * @file Component-mode addressing (PLAN-0028 `p5-002`; PLAN-0026
 * §3.7.1 rules 1–3, §3.7.2).
 *
 * The pure half of component mode: **which declared style target a
 * canvas point hits**, and **how `↑`/`↓` walk the declared order**.
 * Everything here is a function of the live `PuckApi` plus the DOM
 * registry `p5-001` built; nothing here holds state, and nothing here
 * writes to `Data` — the mode and the active target live in the
 * selection controller (`react/editor/selection.ts`), which states that
 * `setMode` never enters history.
 *
 * ### Why hit-testing is geometric rather than `event.target`
 *
 * Puck injects `[data-puck-component] * { pointer-events: none }` into
 * the canvas document and re-enables it only on the component root
 * (`[data-puck-component] { pointer-events: auto !important }`) and on
 * registered overlay portals — verified in
 * `@puckeditor/core@0.22.4`'s `iframeInteractionStyles`. So a press
 * anywhere inside a component reports the **component root** as
 * `event.target`, and `document.elementFromPoint` skips the inner
 * elements for the same reason. Element-level hit-testing therefore
 * cannot read the event target: it resolves the *node* from the event
 * (which does work, the root is the target) and then intersects the
 * pointer against the rects of that node's **declared** target
 * elements. That also enforces §3.7's rule for free — an element a
 * component has not declared and stamped is not in the index, so it can
 * never be hit.
 *
 * ### Declaration order is the traversal order
 *
 * `resolveStyleTargets` returns targets in declaration order and
 * memoizes per `(config, type)` (`puck/component-metadata.ts`), so the
 * `↑`/`↓` sequence is exactly the order the component author wrote —
 * for `blog-list`: `root`, `card`, `cardImage`, `cardMeta`,
 * `cardTitle`, `cardDescription`.
 *
 * ### Puck contract
 *
 * Rule 2: nothing here is document state. Rule 5: no Puck internals —
 * the only Puck surfaces read are the public `PuckApi.config` and the
 * component type behind `canvas/appearance.ts`'s `nodeTypeOf`.
 */

import type { Config, PuckApi } from "@puckeditor/core";
import { resolveStyleTargets } from "../../../puck/component-metadata.js";
import { nodeTypeOf } from "./appearance.js";
import type { CanvasDomRegistry } from "./dom-registry.js";

/** A client-space point inside the canvas document. */
export interface CanvasPoint {
	readonly x: number;
	readonly y: number;
}

const NO_TARGETS: readonly string[] = Object.freeze([]);

/**
 * `↑`/`↓` **stop at the ends; they do not wrap.**
 *
 * Stated as a constant rather than left implicit because it is a
 * behavioural contract `p8-003` restores: a traversal that wraps makes
 * "am I at the last element?" unanswerable without counting, and a
 * screen-reader user pressing `↓` repeatedly would cycle silently
 * forever instead of coming to rest.
 */
export const TARGET_TRAVERSAL_WRAPS = false;

/**
 * A node's declared style target ids, in declaration order.
 *
 * Empty for a node that is not mounted, or whose component declares no
 * v2 metadata — component mode then has nothing to address, which is
 * the §8.5 honest state rather than a fabricated `root`.
 */
export function declaredTargetIds(
	api: PuckApi,
	nodeId: string,
): readonly string[] {
	const type = nodeTypeOf(api, nodeId);
	if (type === undefined) {
		return NO_TARGETS;
	}
	return resolveStyleTargets(api.config as Config, type).map(
		(target) => target.id,
	);
}

/** One declared target's author-facing label, or `undefined`. */
export function declaredTargetLabel(
	api: PuckApi,
	nodeId: string,
	targetId: string,
): string | undefined {
	const type = nodeTypeOf(api, nodeId);
	if (type === undefined) {
		return undefined;
	}
	return resolveStyleTargets(api.config as Config, type).find(
		(target) => target.id === targetId,
	)?.label;
}

/** Ancestor count — a total order for "outermost first". */
function depthOf(element: Element): number {
	let depth = 0;
	let current: Element | null = element.parentElement;
	while (current !== null) {
		depth += 1;
		current = current.parentElement;
	}
	return depth;
}

function containsPoint(element: HTMLElement, point: CanvasPoint): boolean {
	const rect = element.getBoundingClientRect();
	// `right`/`bottom` are derived rather than read: canvas rects are
	// routinely stubbed as `{left, top, width, height}` and a missing
	// `right` would silently read `undefined` and never match.
	return (
		point.x >= rect.left &&
		point.x <= rect.left + rect.width &&
		point.y >= rect.top &&
		point.y <= rect.top + rect.height
	);
}

/**
 * The declared targets of `nodeId` under `point`, **outermost first**.
 *
 * One entry per target id, not per element: a repeated target (every
 * card of a `blog-list`) is one addressable target however many
 * instances render, and only one of them can be under the pointer.
 * Ordering is by DOM depth, which is a total order — sorting by
 * `contains` would be a partial one and `Array#sort` is undefined for
 * those.
 */
export function targetChainAt(
	api: PuckApi,
	registry: CanvasDomRegistry,
	nodeId: string,
	point: CanvasPoint,
): readonly string[] {
	const hits: { readonly targetId: string; readonly depth: number }[] = [];
	for (const targetId of declaredTargetIds(api, nodeId)) {
		for (const element of registry.getTargetElements(nodeId, targetId)) {
			if (containsPoint(element, point)) {
				hits.push({ targetId, depth: depthOf(element) });
				break;
			}
		}
	}
	return hits.sort((a, b) => a.depth - b.depth).map((hit) => hit.targetId);
}

/**
 * The target one `↑`/`↓` press moves to, or `undefined` when the node
 * declares none.
 *
 * `current === undefined` means "the node itself" (§3.7.1), so either
 * direction enters at the FIRST declared target rather than jumping to
 * the far end — entering a list from outside it should land at its
 * start, not at its end. From then on the walk is ±1, clamped
 * ({@link TARGET_TRAVERSAL_WRAPS}).
 */
export function stepTargetId(
	targetIds: readonly string[],
	current: string | undefined,
	delta: number,
): string | undefined {
	if (targetIds.length === 0) {
		return undefined;
	}
	const index = current === undefined ? -1 : targetIds.indexOf(current);
	if (index === -1) {
		return targetIds[0];
	}
	const next = Math.min(Math.max(index + delta, 0), targetIds.length - 1);
	return targetIds[next];
}

/**
 * One descend step for a double-click in component mode: the next
 * target INWARD of `current` along the chain under the pointer, or the
 * innermost when `current` is not on that chain.
 *
 * Mirrors `drillInTarget`'s node-level semantics (`canvas/marquee.tsx`)
 * so "double-click goes one level deeper" means the same thing at both
 * granularities.
 */
export function descendTargetId(
	chain: readonly string[],
	current: string | undefined,
): string | undefined {
	if (chain.length === 0) {
		return undefined;
	}
	const index = current === undefined ? -1 : chain.indexOf(current);
	if (index === -1) {
		return chain[chain.length - 1];
	}
	return chain[Math.min(index + 1, chain.length - 1)];
}
