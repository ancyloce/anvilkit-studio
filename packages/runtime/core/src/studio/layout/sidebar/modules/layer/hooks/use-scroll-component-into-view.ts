/**
 * @file `useScrollComponentIntoView()` — scroll the canvas iframe so a
 * component is visible.
 *
 * Selecting a layer in the sidebar dispatches a Puck `setUi`
 * selection, but Puck does not move the canvas to the selected node.
 * This hook bridges that: given a component id it locates the rendered
 * element inside the preview iframe (Puck tags every rendered component
 * with `data-puck-component="<id>"`) and scrolls it into view.
 *
 * The iframe is found with the same scoped lookup the theme sync uses
 * (`useStudioRootRef` + `resolveQueryRoot`, then `iframe#preview-frame`)
 * so multiple `<Studio>` mounts on one page stay isolated. The scroll
 * is instant and re-asserted on the iframe's next animation frame
 * because the preceding `setUi` selection dispatch re-renders the
 * iframe (overlay mount), which would cancel a smooth animation and
 * can leave the first jump at a stale offset.
 */

import { useCallback } from "react";
import {
	resolveQueryRoot,
	useStudioRootRef,
} from "@/context/StudioRootProvider";

const PUCK_COMPONENT_ATTR = "data-puck-component";

function findPuckIframe(root: ParentNode): HTMLIFrameElement | null {
	if (typeof document === "undefined") return null;
	return root.querySelector<HTMLIFrameElement>("iframe#preview-frame");
}

function findComponentEl(doc: Document, componentId: string): Element | null {
	for (const el of doc.querySelectorAll(`[${PUCK_COMPONENT_ATTR}]`)) {
		if (el.getAttribute(PUCK_COMPONENT_ATTR) === componentId) return el;
	}
	return null;
}

export function useScrollComponentIntoView(): (componentId: string) => void {
	const rootRef = useStudioRootRef();

	return useCallback(
		(componentId: string): void => {
			const iframe = findPuckIframe(resolveQueryRoot(rootRef));
			const doc = iframe?.contentDocument ?? null;
			if (doc === null) return;

			// Instant, not smooth: callers invoke this right after a Puck
			// `setUi` selection dispatch, which re-renders the iframe to
			// mount the selection overlay. A `behavior: "smooth"`
			// animation gets cancelled by that re-render/layout and the
			// canvas never moves. An instant jump completes before the
			// re-render; a second pass on the iframe's next animation
			// frame re-asserts the position after the overlay mounts (and
			// covers a component that mounts late).
			const scroll = (): boolean => {
				const el = findComponentEl(doc, componentId);
				if (el === null) return false;
				el.scrollIntoView({ block: "center", inline: "nearest" });
				return true;
			};

			scroll();
			const win = iframe?.contentWindow ?? null;
			win?.requestAnimationFrame(() => {
				scroll();
			});
		},
		[rootRef],
	);
}
