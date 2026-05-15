/**
 * @file Canvas-side drop controller for sidebar → canvas drag-and-drop
 * replacement.
 *
 * Mounted (via {@link CanvasDropMount}) inside the Puck canvas iframe
 * by the `CanvasIframe` override, which is the single place that owns
 * the live iframe `Document`. Attaches native `dragover` / `dragleave`
 * / `drop` listeners to that document, resolves the Puck component
 * under the pointer through Puck's `data-puck-component="<id>"` DOM
 * tag, validates it against the dragged payload kind, and dispatches a
 * Puck `replace` action — the same dispatch shape used by
 * `state/useInsertSnippet.ts`, just keyed by the dropped-onto id
 * instead of `selectedItem`.
 *
 * Selection is irrelevant here: the target is whatever element is
 * under the cursor at drop time.
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
const IMAGE_ALT_COMPANIONS = ["alt", "title"] as const;

interface ResolvedTarget {
	readonly id: string;
	readonly prop: string;
	readonly element: Element;
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
			const hit = doc.elementFromPoint(clientX, clientY);
			const wrapper = hit?.closest(`[${PUCK_COMPONENT_ATTR}]`) ?? null;
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

		const onDragOver = (event: DragEvent): void => {
			const dt = event.dataTransfer;
			if (dt === null || !hasCanvasDropPayload(dt)) return;
			const kind = peekDropKind(dt);
			if (kind === null) return;
			const target = resolveTarget(event.clientX, event.clientY, kind);
			if (target === null) {
				clearHighlight();
				return;
			}
			// Accepting the drop: prevent default + signal a copy.
			event.preventDefault();
			dt.dropEffect = "copy";
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
					? "studio.module.text.requireSelection"
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

		doc.addEventListener("dragover", onDragOver);
		doc.addEventListener("dragleave", onDragLeave);
		doc.addEventListener("drop", onDrop);
		return () => {
			doc.removeEventListener("dragover", onDragOver);
			doc.removeEventListener("dragleave", onDragLeave);
			doc.removeEventListener("drop", onDrop);
			clearHighlight();
		};
	}, [doc, getPuck, msg]);
}
