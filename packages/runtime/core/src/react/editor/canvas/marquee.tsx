"use client";

/**
 * @file Canvas multi-select: marquee + hierarchy drill-in (PLAN-0020
 * CORE-P1B-007; ED-CANVAS-001).
 *
 * - **Marquee**: a press on empty canvas (no node under the pointer,
 *   no handle) arms a marquee; ≥3 px of travel shows the rubber band
 *   and live-updates the multi-selection to every intersecting node
 *   (Shift adds to the existing selection). Selection never enters
 *   history; scope fencing lives in the selection controller. Puck's
 *   own component drags start ON nodes, so the empty-area trigger
 *   never competes with them; the rubber-band visual itself is
 *   `pointer-events: none`.
 * - **Drill-in**: double-click walks one level deeper through the
 *   node chain under the pointer — outermost first on fresh
 *   selections, then one child level per double-click, bottoming out
 *   at the deepest node.
 *
 * Interaction listens at document-capture level (the proven overlay
 * pattern for cross-document portals); visuals render into the
 * authoring overlay root.
 */

import {
	type ReactNode,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { StudioEditorBridge } from "../bridge.js";
import { isElementNode } from "./dom-registry.js";

interface MarqueeRect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/** Minimum travel before the marquee shows (mirrors gestures). */
const MARQUEE_THRESHOLD_PX = 3;

function toContent(
	doc: Document,
	client: { x: number; y: number },
): { x: number; y: number } {
	const view = doc.defaultView;
	return {
		x: client.x + (view?.scrollX ?? 0),
		y: client.y + (view?.scrollY ?? 0),
	};
}

function rectFrom(
	a: { x: number; y: number },
	b: { x: number; y: number },
): MarqueeRect {
	return {
		x: Math.min(a.x, b.x),
		y: Math.min(a.y, b.y),
		width: Math.abs(a.x - b.x),
		height: Math.abs(a.y - b.y),
	};
}

function intersects(rect: MarqueeRect, other: MarqueeRect): boolean {
	return (
		rect.x < other.x + other.width &&
		rect.x + rect.width > other.x &&
		rect.y < other.y + other.height &&
		rect.y + rect.height > other.y
	);
}

/** The node-id chain under an element, outermost → innermost. */
export function nodeChainOf(
	bridge: StudioEditorBridge,
	target: Element,
): readonly string[] {
	const chain: string[] = [];
	let current: Element | null = target;
	while (current !== null) {
		const nodeId: string | null =
			bridge.canvasRegistry?.getNodeId(current) ?? null;
		if (nodeId === null) {
			break;
		}
		chain.unshift(nodeId);
		const host: Element | null =
			bridge.canvasRegistry?.getPrimaryElement(nodeId) ??
			current.closest(`[data-ak-node="${nodeId}"]`);
		current = host?.parentElement ?? null;
	}
	return chain;
}

/**
 * One drill-in step (§13 hierarchy rule): fresh selections take the
 * outermost node; a selected ancestor steps to the next deeper node
 * in the chain; the deepest node is the floor.
 */
export function drillInTarget(
	chain: readonly string[],
	primaryId: string | undefined,
): string | undefined {
	if (chain.length === 0) {
		return undefined;
	}
	const index = primaryId === undefined ? -1 : chain.indexOf(primaryId);
	if (index === -1) {
		return chain[0];
	}
	return chain[Math.min(index + 1, chain.length - 1)];
}

/** Props for {@link CanvasMarquee}. */
export interface CanvasMarqueeProps {
	readonly bridge: StudioEditorBridge;
}

/** The marquee interaction + rubber-band visual. */
export function CanvasMarquee({ bridge }: CanvasMarqueeProps): ReactNode {
	useSyncExternalStore(bridge.subscribe, bridge.getVersion, bridge.getVersion);
	const [rect, setRect] = useState<MarqueeRect | null>(null);
	const stateRef = useRef<{
		start: { x: number; y: number };
		additive: boolean;
		baseSelection: readonly string[];
		active: boolean;
	} | null>(null);

	const doc = bridge.canvasDocument;

	useEffect(() => {
		if (doc === null) {
			return;
		}
		const onDown = (event: Event): void => {
			const pointer = event as PointerEvent;
			const target = event.target;
			if (!isElementNode(target)) {
				return;
			}
			// Suppressed while an inline session is active (009B).
			if (bridge.inline?.getSession() !== null && bridge.inline !== null) {
				return;
			}
			// Never compete with handles or component presses.
			if (target.closest("[data-ak-handle]") !== null) {
				return;
			}
			if (bridge.canvasRegistry?.getNodeId(target) !== null) {
				return;
			}
			stateRef.current = {
				start: toContent(doc, { x: pointer.clientX, y: pointer.clientY }),
				additive: pointer.shiftKey,
				baseSelection: bridge.selection?.getState().selectedIds ?? [],
				active: false,
			};
		};
		const onMove = (event: Event): void => {
			const state = stateRef.current;
			if (state === null) {
				return;
			}
			const pointer = event as PointerEvent;
			const point = toContent(doc, {
				x: pointer.clientX,
				y: pointer.clientY,
			});
			if (
				!state.active &&
				Math.abs(point.x - state.start.x) < MARQUEE_THRESHOLD_PX &&
				Math.abs(point.y - state.start.y) < MARQUEE_THRESHOLD_PX
			) {
				return;
			}
			state.active = true;
			const band = rectFrom(state.start, point);
			setRect(band);

			const registry = bridge.canvasRegistry;
			if (registry === null || registry === undefined) {
				return;
			}
			const view = doc.defaultView;
			const hits: string[] = [];
			for (const nodeId of registry.listNodeIds()) {
				const element = registry.getPrimaryElement(nodeId);
				if (element === null) {
					continue;
				}
				const bounds = element.getBoundingClientRect();
				const nodeRect: MarqueeRect = {
					x: bounds.left + (view?.scrollX ?? 0),
					y: bounds.top + (view?.scrollY ?? 0),
					width: bounds.width,
					height: bounds.height,
				};
				if (intersects(band, nodeRect)) {
					hits.push(nodeId);
				}
			}
			// Scope fencing (§10.6): a marquee never co-selects an
			// ancestor and its descendant — the outermost hit wins, so
			// bulk commands act on a consistent sibling set.
			const outermost = hits.filter((nodeId) => {
				const element = registry.getPrimaryElement(nodeId);
				if (element === null) {
					return false;
				}
				return !hits.some((otherId) => {
					if (otherId === nodeId) {
						return false;
					}
					const other = registry.getPrimaryElement(otherId);
					return other !== null && other.contains(element);
				});
			});
			const next = state.additive
				? [...new Set([...state.baseSelection, ...outermost])]
				: outermost;
			if (next.length > 0) {
				bridge.selection?.selectMany(next);
			} else if (!state.additive) {
				bridge.selection?.clear();
			}
		};
		const onUp = (): void => {
			stateRef.current = null;
			setRect(null);
		};
		const onDouble = (event: Event): void => {
			const target = event.target;
			if (!isElementNode(target)) {
				return;
			}
			// Declared inline targets take the double-click (009A/009B);
			// drill-in runs only when no editable target matched.
			if (bridge.inline?.tryEnterFromEvent(target) === true) {
				return;
			}
			const chain = nodeChainOf(bridge, target);
			const next = drillInTarget(chain, bridge.selection?.getState().primaryId);
			if (next !== undefined) {
				bridge.selection?.select(next);
			}
		};

		doc.addEventListener("pointerdown", onDown, true);
		doc.addEventListener("pointermove", onMove, true);
		doc.addEventListener("pointerup", onUp, true);
		doc.addEventListener("pointercancel", onUp, true);
		doc.addEventListener("dblclick", onDouble, true);
		return () => {
			doc.removeEventListener("pointerdown", onDown, true);
			doc.removeEventListener("pointermove", onMove, true);
			doc.removeEventListener("pointerup", onUp, true);
			doc.removeEventListener("pointercancel", onUp, true);
			doc.removeEventListener("dblclick", onDouble, true);
		};
	}, [doc, bridge]);

	if (rect === null) {
		return null;
	}
	return (
		<div
			data-ak-marquee
			style={{
				position: "absolute",
				left: `${rect.x}px`,
				top: `${rect.y}px`,
				width: `${rect.width}px`,
				height: `${rect.height}px`,
				border: "1px solid var(--editor-selection, #3b82f6)",
				background:
					"color-mix(in srgb, var(--editor-selection, #3b82f6) 12%, transparent)",
				pointerEvents: "none",
			}}
		/>
	);
}
