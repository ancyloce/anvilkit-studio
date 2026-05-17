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
 * so multiple `<Studio>` mounts on one page stay isolated. A selection
 * change can trigger an iframe re-render, so a miss is retried once on
 * the iframe's next animation frame.
 */

import { useCallback } from "react";
import { resolveQueryRoot, useStudioRootRef } from "@/state/index";

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

			const scroll = (): boolean => {
				const el = findComponentEl(doc, componentId);
				if (el === null) return false;
				el.scrollIntoView({ behavior: "smooth", block: "center" });
				return true;
			};

			if (!scroll()) {
				const win = iframe?.contentWindow ?? null;
				win?.requestAnimationFrame(() => {
					scroll();
				});
			}
		},
		[rootRef],
	);
}
