"use client";

/**
 * @file The canvas pointer-gesture layer: marquee, hierarchy drill-in,
 * and component mode (PLAN-0028 `p4-006` + `p5-002`; originally
 * PLAN-0020 CORE-P1B-007).
 *
 * **One selection model.** Every read and every write goes through the
 * selection controller (`react/editor/selection.ts`) that `p3-007` owns
 * and `p4-004`'s `useShellSelection` binds the panels to. The marquee
 * holds no selection state of its own — only the in-flight band — so the
 * canvas, the Layers panel and the inspector cannot disagree about what
 * is selected. Shift-marquee also preserves the existing PRIMARY rather
 * than promoting the first hit, which is what makes an additive sweep
 * agree with the panel's idea of the primary node.
 *
 * **Locked nodes stay selectable.** `selection.ts` states the rule —
 * mutation is fenced at the write layer, not at selection — so the
 * marquee sweeps them up and `canvas/appearance.ts`'s
 * `isCanvasNodeLocked` keeps them out of every mutating gesture (handles
 * hide entirely; align/distribute drop them from the input).
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
 *
 * ### Component mode rides the SAME listener stack (`p5-002`)
 *
 * PLAN-0026 §3.7.2's gesture table is a second reading of the same four
 * pointer events, not a second interaction layer — a competing document
 * listener stack would have to re-derive suppression, inline-session
 * fencing and handle avoidance, and would drift from them. So the
 * handlers below branch on `selection.mode`:
 *
 * - **hover** — page mode: Puck's own node outline (untouched);
 *   component mode: the declared target under the pointer, outlined on
 *   **every** matched element (§3.7.4);
 * - **click** — page mode: Puck selects the node (untouched); component
 *   mode: selects `(nodeId, targetId)`;
 * - **double-click** — page mode: drill one node deeper, and once the
 *   deepest node is already selected, **into** the component at the
 *   clicked target; component mode: descend to the clicked target;
 * - **pointerdown** — component mode: node dragging must **not exist**
 *   (§3.7.1 rule 3), see `suppressNodeDrag` below.
 *
 * The `Escape` ladder and `↑`/`↓` traversal are keyboard, and live with
 * the rest of the keymap in `shortcuts/` rather than here.
 */

import type { PuckApi } from "@puckeditor/core";
import {
	type ReactNode,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { StudioEditorBridge } from "../bridge.js";
import type { InternalEditorCommandPort } from "../command-port.js";
import {
	type CanvasPoint,
	descendTargetId,
	targetChainAt,
} from "./component-mode.js";
import { type CanvasStyleTargetRef, isElementNode } from "./dom-registry.js";
import { ComponentTargetLayer } from "./target-outline.js";

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

/**
 * The declared target chain under a pointer event, or `null` when the
 * pointer is not over a component this registry knows.
 *
 * Geometric rather than `event.target`-based **because it has to be**:
 * Puck sets `pointer-events: none` on every descendant of a component
 * and re-enables it only on the root, so the event target inside a
 * `blog-list` is always the `blog-list` root. See
 * `canvas/component-mode.ts` for the full note. The `resolveTarget`
 * fallback covers the case where rects are unavailable (a detached or
 * not-yet-laid-out document): it still resolves the stamped ancestor,
 * which for a component root is its `root` target.
 */
function targetChainUnder(
	bridge: StudioEditorBridge,
	api: PuckApi | null,
	element: Element,
	point: CanvasPoint,
): { readonly nodeId: string; readonly chain: readonly string[] } | null {
	const registry = bridge.canvasRegistry;
	if (registry === null || registry === undefined || api === null) {
		return null;
	}
	const nodeId = registry.getNodeId(element);
	if (nodeId === null) {
		return null;
	}
	const chain = targetChainAt(api, registry, nodeId, point);
	if (chain.length > 0) {
		return { nodeId, chain };
	}
	const stamped = registry.resolveTarget(element);
	return {
		nodeId,
		chain:
			stamped === null || stamped.nodeId !== nodeId ? [] : [stamped.targetId],
	};
}

/** Props for {@link CanvasMarquee}. */
export interface CanvasMarqueeProps {
	readonly bridge: StudioEditorBridge;
}

/** The marquee interaction + rubber-band visual. */
export function CanvasMarquee({ bridge }: CanvasMarqueeProps): ReactNode {
	useSyncExternalStore(bridge.subscribe, bridge.getVersion, bridge.getVersion);
	const [rect, setRect] = useState<MarqueeRect | null>(null);
	const [hovered, setHovered] = useState<CanvasStyleTargetRef | null>(null);
	const stateRef = useRef<{
		start: { x: number; y: number };
		additive: boolean;
		baseSelection: readonly string[];
		/** The primary an additive sweep must not steal. */
		basePrimaryId: string | undefined;
		active: boolean;
	} | null>(null);

	const doc = bridge.canvasDocument;

	useEffect(() => {
		if (doc === null) {
			return;
		}
		/** The live `PuckApi`, or `null` — the canvas renders outside `<Puck>`. */
		const puckApi = (): PuckApi | null =>
			(bridge.port as InternalEditorCommandPort | null)?.tryGetPuckApi?.() ??
			null;
		const modeOf = (): "page" | "component" =>
			bridge.selection?.getState().mode ?? "page";
		const chainUnder = (
			element: Element,
			event: MouseEvent,
		): { readonly nodeId: string; readonly chain: readonly string[] } | null =>
			targetChainUnder(bridge, puckApi(), element, {
				x: event.clientX,
				y: event.clientY,
			});
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
			// §3.7.1 rule 3 — in component mode the node-drag gesture must
			// NOT EXIST rather than start and fail. Puck's sortable binds a
			// BUBBLE-phase `pointerdown` on the component element itself
			// (dnd-kit `PointerSensor.bind` → `source.handle ?? source.element`),
			// so stopping propagation here, in the document CAPTURE phase,
			// means `handlePointerDown` is never reached: no activation
			// controller and therefore no half-started drag to clean up. It is
			// the same mechanism Puck's own
			// `registerOverlayPortal({ disableDrag })` uses, applied at the
			// document rather than per overlay element. Overlay portals keep
			// their presses — the selection toolbar and the handles live in
			// them.
			if (modeOf() === "component") {
				if (target.closest("[data-puck-overlay-portal]") === null) {
					event.stopPropagation();
				}
				// The marquee is node multi-select; component mode addresses a
				// target inside ONE node, so it never arms here either.
				return;
			}
			if (bridge.canvasRegistry?.getNodeId(target) !== null) {
				return;
			}
			const selection = bridge.selection?.getState();
			stateRef.current = {
				start: toContent(doc, { x: pointer.clientX, y: pointer.clientY }),
				additive: pointer.shiftKey,
				baseSelection: selection?.selectedIds ?? [],
				basePrimaryId: selection?.primaryId,
				active: false,
			};
		};
		/**
		 * Component-mode hover, folded into the move handler rather than
		 * given a `pointerover` listener of its own: with
		 * `pointer-events: none` on every inner element, `pointerover`
		 * fires once for the whole component and never again as the
		 * pointer crosses between its targets — it would report the first
		 * element hovered and then go stale.
		 */
		const updateHover = (event: MouseEvent): void => {
			if (modeOf() !== "component") {
				setHovered((previous) => (previous === null ? previous : null));
				return;
			}
			const target = event.target;
			const hit = !isElementNode(target) ? null : chainUnder(target, event);
			const targetId =
				hit === null ? undefined : hit.chain[hit.chain.length - 1];
			setHovered((previous) => {
				if (hit === null || targetId === undefined) {
					return previous === null ? previous : null;
				}
				return previous !== null &&
					previous.nodeId === hit.nodeId &&
					previous.targetId === targetId
					? previous
					: { nodeId: hit.nodeId, targetId };
			});
		};
		const onMove = (event: Event): void => {
			updateHover(event as MouseEvent);
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
				// An additive sweep keeps the primary it started with, so the
				// canvas and the Layers panel agree about which node the
				// single-node affordances act on.
				const primaryId =
					state.additive && state.basePrimaryId !== undefined
						? state.basePrimaryId
						: undefined;
				bridge.selection?.selectMany(next, primaryId);
			} else if (!state.additive) {
				bridge.selection?.clear();
			}
		};
		const onUp = (): void => {
			stateRef.current = null;
			setRect(null);
		};
		/** Move the selection to one `(nodeId, targetId)` pair. */
		const selectTarget = (nodeId: string, targetId: string): void => {
			if (bridge.selection?.getState().primaryId !== nodeId) {
				bridge.selection?.select(nodeId);
			}
			// `setTargetId` funnels through the selection controller's own
			// declared-target guard, so a target the new primary does not
			// declare is dropped there rather than checked again here.
			bridge.selection?.setTargetId(targetId);
		};
		const onClick = (event: Event): void => {
			if (modeOf() !== "component") {
				return;
			}
			const target = event.target;
			if (
				!isElementNode(target) ||
				target.closest("[data-ak-handle]") !== null
			) {
				return;
			}
			const hit = chainUnder(target, event as MouseEvent);
			const targetId =
				hit === null ? undefined : hit.chain[hit.chain.length - 1];
			if (hit === null || targetId === undefined) {
				return;
			}
			selectTarget(hit.nodeId, targetId);
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
			const selection = bridge.selection?.getState();
			const hit = chainUnder(target, event as MouseEvent);
			if (selection?.mode === "component") {
				// Already inside: descend one level toward the clicked target.
				if (hit === null || hit.chain.length === 0) {
					return;
				}
				const next = descendTargetId(
					hit.chain,
					selection.primaryId === hit.nodeId ? selection.targetId : undefined,
				);
				if (next !== undefined) {
					selectTarget(hit.nodeId, next);
				}
				return;
			}
			const chain = nodeChainOf(bridge, target);
			const next = drillInTarget(chain, selection?.primaryId);
			const innermost =
				hit === null ? undefined : hit.chain[hit.chain.length - 1];
			// The deepest node is already selected and the pointer is over a
			// DECLARED element: the next step down is into the component
			// (§3.7.2 "double-click **into** a component"). An element the
			// component never declared has no entry — it is not addressable,
			// so there is nothing to enter at.
			if (
				next !== undefined &&
				next === selection?.primaryId &&
				hit !== null &&
				hit.nodeId === next &&
				innermost !== undefined
			) {
				bridge.selection?.setMode("component");
				bridge.selection?.setTargetId(innermost);
				return;
			}
			if (next !== undefined) {
				bridge.selection?.select(next);
			}
		};

		doc.addEventListener("pointerdown", onDown, true);
		doc.addEventListener("pointermove", onMove, true);
		doc.addEventListener("pointerup", onUp, true);
		doc.addEventListener("pointercancel", onUp, true);
		doc.addEventListener("click", onClick, true);
		doc.addEventListener("dblclick", onDouble, true);
		return () => {
			doc.removeEventListener("pointerdown", onDown, true);
			doc.removeEventListener("pointermove", onMove, true);
			doc.removeEventListener("pointerup", onUp, true);
			doc.removeEventListener("pointercancel", onUp, true);
			doc.removeEventListener("click", onClick, true);
			doc.removeEventListener("dblclick", onDouble, true);
		};
	}, [doc, bridge]);

	return (
		<>
			{rect === null ? null : (
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
			)}
			{doc === null ? null : (
				<ComponentTargetLayer bridge={bridge} doc={doc} hovered={hovered} />
			)}
		</>
	);
}
