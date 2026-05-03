/**
 * @file Selector hooks for the editor UI store.
 *
 * `useEditorUiStore` is the generic selector entrypoint; the named
 * shortcuts cover the slices the layout shell reads frequently. All
 * shortcuts return a tuple of `[value, setter]` so consumers can use
 * them like `useState` for ergonomic local wiring.
 */

import { useStore } from "zustand";

import type { EditorTab, EditorUiState } from "./editor-ui-store.js";
import { useEditorUiStoreApi } from "./EditorUiStoreProvider.js";

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
