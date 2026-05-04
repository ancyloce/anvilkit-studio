/**
 * @file Internal barrel for `react/studio/state`.
 *
 * Phase 5 will reach in to mount the providers from `<Studio>`. This
 * barrel keeps the import surface compact while leaving the
 * factory-vs-hooks split visible at the file level.
 */

export {
	type AssetCategoryFilter,
	type ComponentViewMode,
	type CopyCategoryFilter,
	createEditorUiStore,
	type CreateEditorUiStoreOptions,
	EDITOR_UI_STORE_PERSIST_VERSION,
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
	useAssetCategoryFilter,
	useCanvasViewport,
	useCanvasZoom,
	useComponentViewMode,
	useCopyCategoryFilter,
	useDrawerSearch,
	useEditorUiStore,
	useInsertSectionsExpanded,
	useLayerSplitRatio,
	usePagesExpanded,
} from "./hooks.js";
export {
	EditorI18nStoreProvider,
	type EditorI18nStoreProviderProps,
	useMsg,
} from "./editor-i18n-store.js";
export {
	createSidebarRegistryStore,
	type SidebarRegistryState,
	type SidebarRegistryStoreApi,
} from "./sidebar-registry-store.js";
export {
	SidebarRegistryProvider,
	type SidebarRegistryProviderProps,
	useSidebarRegistryStoreApi,
	useSidebarRegistryStoreApiOrNull,
} from "./SidebarRegistryProvider.js";
export { useSidebarRegistry } from "./sidebar-registry-store-react.js";
