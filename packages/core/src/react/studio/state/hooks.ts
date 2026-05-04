/**
 * @file Selector hooks for the editor UI store.
 *
 * `useEditorUiStore` is the generic selector entrypoint; the named
 * shortcuts cover the slices the layout shell reads frequently. All
 * shortcuts return a tuple of `[value, setter]` so consumers can use
 * them like `useState` for ergonomic local wiring.
 */

import { useStore } from "zustand";

import type {
	AssetCategoryFilter,
	ComponentViewMode,
	CopyCategoryFilter,
	EditorTab,
	EditorUiState,
} from "./editor-ui-store";
import { useEditorUiStoreApi } from "./EditorUiStoreProvider";

export function useEditorUiStore<TResult>(
	selector: (state: EditorUiState) => TResult,
): TResult {
	const store = useEditorUiStoreApi();
	return useStore(store, selector);
}

export function useActiveTab(): readonly [
	EditorTab,
	(tab: EditorTab) => void,
] {
	const tab = useEditorUiStore((s) => s.activeTab);
	const set = useEditorUiStore((s) => s.setActiveTab);
	return [tab, set];
}

export function useDrawerSearch(): readonly [string, (q: string) => void] {
	const value = useEditorUiStore((s) => s.drawerSearch);
	const set = useEditorUiStore((s) => s.setDrawerSearch);
	return [value, set];
}

export function useCanvasZoom(): readonly [number, (z: number) => void] {
	const value = useEditorUiStore((s) => s.canvasZoom);
	const set = useEditorUiStore((s) => s.setCanvasZoom);
	return [value, set];
}

export function useCanvasViewport(): readonly [
	string,
	(viewport: string) => void,
] {
	const value = useEditorUiStore((s) => s.canvasViewport);
	const set = useEditorUiStore((s) => s.setCanvasViewport);
	return [value, set];
}

export function useComponentViewMode(): readonly [
	ComponentViewMode,
	(mode: ComponentViewMode) => void,
] {
	const value = useEditorUiStore((s) => s.componentViewMode);
	const set = useEditorUiStore((s) => s.setComponentViewMode);
	return [value, set];
}

export function useInsertSectionsExpanded(): readonly [
	Readonly<Record<string, boolean>>,
	(id: string, expanded: boolean) => void,
] {
	const value = useEditorUiStore((s) => s.insertSectionsExpanded);
	const set = useEditorUiStore((s) => s.setInsertSectionExpanded);
	return [value, set];
}

export function useAssetCategoryFilter(): readonly [
	AssetCategoryFilter,
	(filter: AssetCategoryFilter) => void,
] {
	const value = useEditorUiStore((s) => s.assetCategoryFilter);
	const set = useEditorUiStore((s) => s.setAssetCategoryFilter);
	return [value, set];
}

export function useCopyCategoryFilter(): readonly [
	CopyCategoryFilter,
	(filter: CopyCategoryFilter) => void,
] {
	const value = useEditorUiStore((s) => s.copyCategoryFilter);
	const set = useEditorUiStore((s) => s.setCopyCategoryFilter);
	return [value, set];
}

export function usePagesExpanded(): readonly [
	Readonly<Record<string, boolean>>,
	(id: string, expanded: boolean) => void,
] {
	const value = useEditorUiStore((s) => s.pagesExpanded);
	const set = useEditorUiStore((s) => s.setPageExpanded);
	return [value, set];
}

export function useLayerSplitRatio(): readonly [number, (ratio: number) => void] {
	const value = useEditorUiStore((s) => s.layerSplitRatio);
	const set = useEditorUiStore((s) => s.setLayerSplitRatio);
	return [value, set];
}
