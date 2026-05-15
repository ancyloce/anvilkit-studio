/**
 * @file Canvas-side drop controller for sidebar → canvas drag-and-drop
 * replacement.
 *
 * Mounted (via {@link CanvasDropMount}) inside the Puck canvas iframe
 * by the `CanvasIframe` override, which is the single place that owns
 * the live iframe `Document`. Attaches native `dragenter` / `dragover`
 * / `dragleave` / `drop` listeners to that document, resolves the Puck
 * component under the pointer, validates it against the dragged payload
 * kind, and dispatches a Puck `replace` action — the same dispatch
 * shape used by `state/useInsertSnippet.ts`, just keyed by the
 * dropped-onto id instead of `selectedItem`.
 *
 * Selection is irrelevant here: the target is whatever component is
 * under the cursor at drop time.
 *
 * Hit-testing note: Puck renders a per-component overlay as a portal
 * into the iframe `document.body` — a body-level `[data-puck-overlay]`
 * div absolutely positioned over each component's rect, and a *sibling*
 * of (not nested under) the `[data-puck-component]` wrapper. So the
 * topmost element at the pointer during a drag is usually that overlay,
 * and `el.closest('[data-puck-component]')` returns null. We therefore
 * walk the full `elementsFromPoint` stack and, failing that, fall back
 * to rect geometry over every `[data-puck-component]` (the same
 * approach Puck uses internally via `elementsFromPoint`). And per the
 * HTML5 DnD contract we always `preventDefault()` on
 * `dragenter`/`dragover` while our payload is present, so the browser
 * actually fires `drop` regardless of which layer is on top.
 */

import {
	type ComponentData as PuckComponentData,
	useGetPuck,
} from "@puckeditor/core";
import { useEffect } from "react";
import { toast } from "sonner";
import { useMsg } from "@/state/editor-i18n-store";
import {
	type CanvasDropKind,
	hasCanvasDropPayload,
	peekDropKind,
	readDropPayload,
} from "./drag-payload";
import {
	resolveImageTargetProp,
	resolveTextTargetProp,
} from "./resolve-target-prop";

/** Attribute toggled on the hovered drop target for the highlight ring. */
export const DROP_TARGET_ATTR = "data-ak-drop-target";

const PUCK_COMPONENT_ATTR = "data-puck-component";
const PUCK_COMPONENT_SELECTOR = `[${PUCK_COMPONENT_ATTR}]`;
const IMAGE_ALT_COMPANIONS = ["alt", "title"] as const;

interface ResolvedTarget {
	readonly id: string;
	readonly prop: string;
	readonly element: Element;
}

/**
 * Resolve the `[data-puck-component]` wrapper under `(x, y)`, seeing
 * past Puck's body-level overlay portal.
 *
 * 1. Walk the full `elementsFromPoint` stack and return the first
 *    element that is (or is inside) a component wrapper — handles the
 *    normal and nested-zone cases and skips overlay/portal layers that
 *    aren't nested in a component.
 * 2. Geometry fallback: when the stack is only overlay/portal/body
 *    layers (the common real-drag case), pick the component whose rect
 *    contains the point with the smallest area — i.e. the deepest /
 *    most-specific component, correct for nested zones.
 */
function resolveComponentElementAt(
	doc: Document,
	x: number,
	y: number,
): Element | null {
	const stack =
		typeof doc.elementsFromPoint === "function"
			? doc.elementsFromPoint(x, y)
			: [doc.elementFromPoint(x, y)].filter((el): el is Element => el !== null);
	for (const el of stack) {
		const wrapper = el.closest(PUCK_COMPONENT_SELECTOR);
		if (wrapper !== null) return wrapper;
	}

	let best: Element | null = null;
	let bestArea = Number.POSITIVE_INFINITY;
	for (const el of Array.from(doc.querySelectorAll(PUCK_COMPONENT_SELECTOR))) {
		const r = el.getBoundingClientRect();
		if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
			const area = r.width * r.height;
			if (area < bestArea) {
				bestArea = area;
				best = el;
			}
		}
	}
	return best;
}

/**
 * Installs the canvas drop controller on `doc`. No-op while `doc` is
 * undefined (iframe not yet mounted). Re-binds when `doc` changes and
 * tears every listener + highlight down on unmount.
 */
export function useCanvasDropController(doc: Document | undefined): void {
	const getPuck = useGetPuck();
	const msg = useMsg();

	useEffect(() => {
		if (doc === undefined) return;

		let highlighted: Element | null = null;

		const clearHighlight = (): void => {
			if (highlighted !== null) {
				highlighted.removeAttribute(DROP_TARGET_ATTR);
				highlighted = null;
			}
		};

		const resolveTarget = (
			clientX: number,
			clientY: number,
			kind: CanvasDropKind,
		): ResolvedTarget | null => {
			const wrapper = resolveComponentElementAt(doc, clientX, clientY);
			if (wrapper === null) return null;
			const id = wrapper.getAttribute(PUCK_COMPONENT_ATTR);
			if (id === null || id === "") return null;
			const snapshot = getPuck();
			const item = snapshot.getItemById(id);
			if (item === undefined) return null;
			const prop =
				kind === "text"
					? resolveTextTargetProp(item, snapshot.config)
					: resolveImageTargetProp(item, snapshot.config);
			if (prop === null) return null;
			return { id, prop, element: wrapper };
		};

		const onDragEnter = (event: DragEvent): void => {
			const dt = event.dataTransfer;
			if (dt === null || !hasCanvasDropPayload(dt)) return;
			// Mark the canvas as a drop surface so the browser keeps the
			// drag alive and will fire `drop` here.
			event.preventDefault();
		};

		const onDragOver = (event: DragEvent): void => {
			const dt = event.dataTransfer;
			if (dt === null || !hasCanvasDropPayload(dt)) return;
			// HTML5 DnD contract: the browser only fires `drop` if the
			// last `dragover` over the surface called preventDefault().
			// The canvas is always a valid surface for our payload — what
			// gets replaced is decided in `onDrop`. Never gate this on
			// target resolution (Puck's overlay sits on top of components,
			// so resolution often "misses" mid-drag).
			event.preventDefault();
			dt.dropEffect = "copy";

			const kind = peekDropKind(dt);
			const target =
				kind === null
					? null
					: resolveTarget(event.clientX, event.clientY, kind);
			if (target === null) {
				clearHighlight();
				return;
			}
			if (highlighted !== target.element) {
				clearHighlight();
				target.element.setAttribute(DROP_TARGET_ATTR, "");
				highlighted = target.element;
			}
		};

		const onDragLeave = (event: DragEvent): void => {
			// `relatedTarget === null` ⇒ pointer left the iframe document.
			if (event.relatedTarget === null) clearHighlight();
		};

		const onDrop = (event: DragEvent): void => {
			const dt = event.dataTransfer;
			if (dt === null || !hasCanvasDropPayload(dt)) return;
			event.preventDefault();
			clearHighlight();

			const payload = readDropPayload(dt);
			if (payload === null) return;

			const warnKey =
				payload.kind === "text"
					? "studio.module.text.requireTarget"
					: "studio.module.image.requireTarget";

			const target = resolveTarget(event.clientX, event.clientY, payload.kind);
			if (target === null) {
				toast.warning(msg(warnKey));
				return;
			}

			const snapshot = getPuck();
			const item = snapshot.getItemById(target.id);
			const selector = snapshot.getSelectorForId(target.id);
			if (item === undefined || selector === undefined) {
				// Race: node moved/removed between dragover and drop.
				toast.warning(msg(warnKey));
				return;
			}

			// `getItemById` returns a Puck node whose props carry `id`;
			// narrow so the rebuilt `replace` payload keeps that shape
			// (mirrors `state/useInsertSnippet.ts`).
			const targetItem = item as PuckComponentData & {
				readonly props: { readonly id: string } & Record<string, unknown>;
			};
			const value = payload.kind === "text" ? payload.body : payload.url;
			const nextProps: { id: string } & Record<string, unknown> = {
				...targetItem.props,
				[target.prop]: value,
			};
			// Best-effort: keep an existing alt/title companion in sync
			// with the new image. Never *adds* a prop the component
			// didn't already declare.
			if (payload.kind === "image" && payload.alt !== "") {
				for (const companion of IMAGE_ALT_COMPANIONS) {
					if (Object.hasOwn(targetItem.props, companion)) {
						nextProps[companion] = payload.alt;
					}
				}
			}

			snapshot.dispatch({
				type: "replace",
				destinationIndex: selector.index,
				destinationZone: selector.zone,
				data: { ...targetItem, props: nextProps },
			});
		};

		doc.addEventListener("dragenter", onDragEnter);
		doc.addEventListener("dragover", onDragOver);
		doc.addEventListener("dragleave", onDragLeave);
		doc.addEventListener("drop", onDrop);
		return () => {
			doc.removeEventListener("dragenter", onDragEnter);
			doc.removeEventListener("dragover", onDragOver);
			doc.removeEventListener("dragleave", onDragLeave);
			doc.removeEventListener("drop", onDrop);
			clearHighlight();
		};
	}, [doc, getPuck, msg]);
}
