/**
 * @file Internal barrel for `react/studio/state`.
 *
 * Phase 5 will reach in to mount the providers from `<Studio>`. This
 * barrel keeps the import surface compact while leaving the
 * factory-vs-hooks split visible at the file level.
 */

export {
	createEditorUiStore,
	type CreateEditorUiStoreOptions,
	type EditorTab,
	type EditorUiState,
	type EditorUiStoreApi,
} from "./editor-ui-store.js";
export {
	EditorUiStoreProvider,
	type EditorUiStoreProviderProps,
	useEditorUiStoreApi,
} from "./EditorUiStoreProvider.js";
export {
	useActiveTab,
	useCanvasViewport,
	useCanvasZoom,
	useDrawerSearch,
	useEditorUiStore,
} from "./hooks.js";
export {
	EditorI18nStoreProvider,
	type EditorI18nStoreProviderProps,
	useMsg,
} from "./editor-i18n-store.js";
