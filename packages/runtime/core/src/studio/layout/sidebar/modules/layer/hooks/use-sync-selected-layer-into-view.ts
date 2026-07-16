/**
 * @file `useSyncSelectedLayerIntoView()` — canvas→sidebar selection sync
 * (task Phase 6).
 *
 * `useLayerTree()`'s `selectedId` already reflects Puck's live
 * selection regardless of source (a canvas click updates it exactly
 * like a layer-row click), but nothing previously reacted to it: only
 * the reverse direction existed (`useScrollComponentIntoView`, fired
 * from `LayerRow`'s own click handler). This hook closes the loop —
 * when the selection changes, it expands every collapsed ancestor of
 * the selected node and scrolls its row into view within the sidebar's
 * own scroll region.
 */

import { useEffect } from "react";
import {
	resolveQueryRoot,
	useStudioRootRef,
} from "@/context/StudioRootProvider";
import { findAncestorIds, type LayerNode } from "./use-layer-tree";

export function useSyncSelectedLayerIntoView(
	roots: readonly LayerNode[],
	selectedId: string | null,
	outlineExpanded: Readonly<Record<string, boolean>>,
	setOutlineExpanded: (id: string, expanded: boolean) => void,
): void {
	const rootRef = useStudioRootRef();

	// Expand ancestors first — a separate effect from the scroll below so
	// the scroll query runs against DOM that already reflects the
	// just-expanded rows (this effect's `outlineExpanded` writes trigger
	// a re-render; the scroll effect re-runs after that commit).
	useEffect(() => {
		if (selectedId === null) return;
		for (const ancestorId of findAncestorIds(roots, selectedId)) {
			if (outlineExpanded[ancestorId] === false) {
				setOutlineExpanded(ancestorId, true);
			}
		}
	}, [roots, selectedId, outlineExpanded, setOutlineExpanded]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: outlineExpanded deliberately re-triggers this effect after the ancestor-expand effect above commits, so the scroll query sees the now-expanded DOM
	useEffect(() => {
		if (selectedId === null) return;
		if (typeof document === "undefined") return;
		const root = resolveQueryRoot(rootRef);
		const raf = requestAnimationFrame(() => {
			const el = root.querySelector(
				`[data-testid="ak-layer-node-${CSS.escape(selectedId)}"]`,
			);
			el?.scrollIntoView({ block: "nearest" });
		});
		return () => cancelAnimationFrame(raf);
	}, [selectedId, outlineExpanded, rootRef]);
}
