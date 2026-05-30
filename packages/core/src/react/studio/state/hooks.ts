/**
 * @file Selector hooks for the editor UI store.
 *
 * `useEditorUiStore` is the generic selector entrypoint; the named
 * shortcuts cover the slices the layout shell reads frequently. All
 * shortcuts return a tuple of `[value, setter]` so consumers can use
 * them like `useState` for ergonomic local wiring.
 *
 * Each shortcut takes a single `useShallow`-wrapped subscription
 * (review finding Z-f) so it issues one store subscription and returns
 * a referentially-stable tuple while `value`/`setter` are unchanged.
 */

import { useStore } from "zustand";
import { useShallow } from "zustand/shallow";
import { useEditorUiStoreApi } from "./EditorUiStoreProvider";
import type {
	AssetCategoryFilter,
	ComponentViewMode,
	CopyCategoryFilter,
	EditorTab,
	EditorUiState,
} from "./editor-ui-store";

export function useEditorUiStore<TResult>(
	selector: (state: EditorUiState) => TResult,
): TResult {
	const store = useEditorUiStoreApi();
	return useStore(store, selector);
}

export function useActiveTab(): readonly [EditorTab, (tab: EditorTab) => void] {
	return useEditorUiStore(
		useShallow((s) => [s.activeTab, s.setActiveTab] as const),
	);
}

export function useDrawerSearch(): readonly [string, (q: string) => void] {
	return useEditorUiStore(
		useShallow((s) => [s.drawerSearch, s.setDrawerSearch] as const),
	);
}

export function useCanvasZoom(): readonly [number, (z: number) => void] {
	return useEditorUiStore(
		useShallow((s) => [s.canvasZoom, s.setCanvasZoom] as const),
	);
}

export function useCanvasViewport(): readonly [
	string,
	(viewport: string) => void,
] {
	return useEditorUiStore(
		useShallow((s) => [s.canvasViewport, s.setCanvasViewport] as const),
	);
}

export function useComponentViewMode(): readonly [
	ComponentViewMode,
	(mode: ComponentViewMode) => void,
] {
	return useEditorUiStore(
		useShallow((s) => [s.componentViewMode, s.setComponentViewMode] as const),
	);
}

export function useInsertSectionsExpanded(): readonly [
	Readonly<Record<string, boolean>>,
	(id: string, expanded: boolean) => void,
] {
	return useEditorUiStore(
		useShallow(
			(s) => [s.insertSectionsExpanded, s.setInsertSectionExpanded] as const,
		),
	);
}

export function useAssetCategoryFilter(): readonly [
	AssetCategoryFilter,
	(filter: AssetCategoryFilter) => void,
] {
	return useEditorUiStore(
		useShallow(
			(s) => [s.assetCategoryFilter, s.setAssetCategoryFilter] as const,
		),
	);
}

export function useCopyCategoryFilter(): readonly [
	CopyCategoryFilter,
	(filter: CopyCategoryFilter) => void,
] {
	return useEditorUiStore(
		useShallow((s) => [s.copyCategoryFilter, s.setCopyCategoryFilter] as const),
	);
}

export function usePagesExpanded(): readonly [
	Readonly<Record<string, boolean>>,
	(id: string, expanded: boolean) => void,
] {
	return useEditorUiStore(
		useShallow((s) => [s.pagesExpanded, s.setPageExpanded] as const),
	);
}

export function useLayerSplitRatio(): readonly [
	number,
	(ratio: number) => void,
] {
	return useEditorUiStore(
		useShallow((s) => [s.layerSplitRatio, s.setLayerSplitRatio] as const),
	);
}
