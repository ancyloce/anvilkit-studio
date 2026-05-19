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
  findImageTargetAt,
  findStringPropPath,
  findTextElementAt,
  findUrlPropPath,
  getAtPath,
  hasReplaceableTarget,
  type PropPath,
  setPropAtPath,
} from "./resolve-field-path";
import {
  resolveImageTargetProp,
  resolveTextTargetProp,
} from "./resolve-target-prop";

/** Attribute toggled on the hovered drop target for the highlight ring. */
export const DROP_TARGET_ATTR = "data-ak-drop-target";

const PUCK_COMPONENT_ATTR = "data-puck-component";
const PUCK_COMPONENT_SELECTOR = `[${PUCK_COMPONENT_ATTR}]`;
const IMAGE_ALT_COMPANIONS = ["alt", "title"] as const;

interface ResolvedComponent {
  readonly id: string;
  readonly element: Element;
  readonly item: PuckComponentData & {
    readonly props: { readonly id: string } & Record<string, unknown>;
  };
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

    const resolveComponent = (
      clientX: number,
      clientY: number,
    ): ResolvedComponent | null => {
      const wrapper = resolveComponentElementAt(doc, clientX, clientY);
      if (wrapper === null) return null;
      const id = wrapper.getAttribute(PUCK_COMPONENT_ATTR);
      if (id === null || id === "") return null;
      const item = getPuck().getItemById(id);
      if (item === undefined) return null;
      return {
        id,
        element: wrapper,
        item: item as ResolvedComponent["item"],
      };
    };

    // Apply (or clear) the highlight for an already-resolved target.
    const applyTargetHighlight = (element: Element | null): void => {
      if (element === null) {
        clearHighlight();
        return;
      }
      if (highlighted !== element) {
        clearHighlight();
        element.setAttribute(DROP_TARGET_ATTR, "");
        highlighted = element;
      }
    };

    // `dragover` fires at pointer-move frequency; the target resolution
    // it drives is a full DOM walk + prop scan. Coalesce to one
    // resolution per animation frame and memoize the last position so
    // near-identical pointer samples reuse the prior result instead of
    // re-walking the tree (review §3 — hot drag path). Drop is
    // unaffected: `onDrop` re-resolves at the authoritative coords.
    const view =
      doc.defaultView ?? (typeof window !== "undefined" ? window : null);
    const HIT_EPSILON = 2;
    let rafId: number | null = null;
    let pending: { x: number; y: number; kind: CanvasDropKind } | null = null;
    let lastResolved: {
      x: number;
      y: number;
      kind: CanvasDropKind;
      element: Element | null;
    } | null = null;

    const flush = (): void => {
      rafId = null;
      const pos = pending;
      pending = null;
      if (pos === null) return;
      if (
        lastResolved !== null &&
        lastResolved.kind === pos.kind &&
        Math.abs(pos.x - lastResolved.x) <= HIT_EPSILON &&
        Math.abs(pos.y - lastResolved.y) <= HIT_EPSILON
      ) {
        applyTargetHighlight(lastResolved.element);
        return;
      }
      const target = resolveComponent(pos.x, pos.y);
      const element =
        target !== null && hasReplaceableTarget(target.item.props, pos.kind)
          ? target.element
          : null;
      lastResolved = { x: pos.x, y: pos.y, kind: pos.kind, element };
      applyTargetHighlight(element);
    };

    const scheduleFlush = (): void => {
      if (rafId !== null) return;
      if (typeof view?.requestAnimationFrame === "function") {
        rafId = view.requestAnimationFrame(flush);
      } else {
        // No rAF (some test harnesses): coalesce to a microtask so
        // behavior degrades gracefully rather than crashing.
        rafId = 0;
        queueMicrotask(() => {
          if (rafId !== null) flush();
        });
      }
    };

    const cancelFlush = (): void => {
      if (rafId === null) return;
      if (typeof view?.cancelAnimationFrame === "function") {
        view.cancelAnimationFrame(rafId);
      }
      rafId = null;
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
      // This (and every `dt` read) MUST stay synchronous — the
      // event/dataTransfer is invalid once the handler returns.
      // What gets replaced is decided in `onDrop`; never gate this
      // on target resolution.
      event.preventDefault();
      dt.dropEffect = "copy";

      const kind = peekDropKind(dt);
      if (kind === null) {
        // No resolvable kind — drop the cache and any highlight.
        pending = null;
        lastResolved = null;
        clearHighlight();
        return;
      }
      // Stash coords + kind; the DOM walk happens in `flush`.
      pending = { x: event.clientX, y: event.clientY, kind };
      scheduleFlush();
    };

    const onDragLeave = (event: DragEvent): void => {
      // `relatedTarget === null` ⇒ pointer left the iframe document.
      if (event.relatedTarget === null) {
        pending = null;
        lastResolved = null;
        clearHighlight();
      }
    };

    const onDrop = (event: DragEvent): void => {
      const dt = event.dataTransfer;
      if (dt === null || !hasCanvasDropPayload(dt)) return;
      event.preventDefault();
      // Drag ended: drop the coalesced highlight + cache.
      cancelFlush();
      pending = null;
      lastResolved = null;
      clearHighlight();

      const payload = readDropPayload(dt);
      if (payload === null) return;

      const warnKey =
        payload.kind === "text"
          ? "studio.module.text.requireTarget"
          : "studio.module.image.requireTarget";

      const target = resolveComponent(event.clientX, event.clientY);
      if (target === null) {
        toast.warning(msg(warnKey));
        return;
      }

      const snapshot = getPuck();
      const selector = snapshot.getSelectorForId(target.id);
      if (selector === undefined) {
        // Race: node moved/removed between dragover and drop.
        toast.warning(msg(warnKey));
        return;
      }

      const targetItem = target.item;
      const value = payload.kind === "text" ? payload.body : payload.url;

      // 1. Position heuristic — replace the prop whose value renders
      //    under the cursor (the *corresponding* text/image).
      let path: PropPath | null = null;
      if (payload.kind === "text") {
        const hitText = findTextElementAt(
          target.element,
          event.clientX,
          event.clientY,
        );
        path =
          hitText === null
            ? null
            : findStringPropPath(targetItem.props, hitText);
      } else {
        const hitUrl = findImageTargetAt(
          target.element,
          event.clientX,
          event.clientY,
        );
        path =
          hitUrl === null ? null : findUrlPropPath(targetItem.props, hitUrl);
      }

      let nextProps: { id: string } & Record<string, unknown>;
      if (path !== null) {
        nextProps = setPropAtPath(targetItem.props, path, value);
        // Keep an existing alt/title companion (sibling of the
        // replaced image prop) in sync. Never *adds* a prop.
        if (payload.kind === "image" && payload.alt !== "") {
          const parent = path.slice(0, -1);
          const parentObj = getAtPath(nextProps, parent);
          if (parentObj !== null && typeof parentObj === "object") {
            for (const companion of IMAGE_ALT_COMPANIONS) {
              if (Object.hasOwn(parentObj, companion)) {
                nextProps = setPropAtPath(
                  nextProps,
                  [...parent, companion],
                  payload.alt,
                );
              }
            }
          }
        }
      } else {
        // 2. Fallback — top-level candidate prop (the prior
        //    heuristic; keeps bare Text/Image + bg-image-only
        //    components working when value matching can't pin a
        //    prop, e.g. empty/duplicated values).
        const prop =
          payload.kind === "text"
            ? resolveTextTargetProp(targetItem, snapshot.config)
            : resolveImageTargetProp(targetItem, snapshot.config);
        if (prop === null) {
          toast.warning(msg(warnKey));
          return;
        }
        nextProps = { ...targetItem.props, [prop]: value };
        if (payload.kind === "image" && payload.alt !== "") {
          for (const companion of IMAGE_ALT_COMPANIONS) {
            if (Object.hasOwn(targetItem.props, companion)) {
              nextProps[companion] = payload.alt;
            }
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
      cancelFlush();
      clearHighlight();
    };
  }, [doc, getPuck, msg]);
}
