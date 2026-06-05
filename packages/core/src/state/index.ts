/**
 * @file Barrel for `@anvilkit/core`'s unified Studio state layer
 * (`src/state/`).
 *
 * This directory is the single home for all per-`<Studio>`-instance state.
 * It merges what were previously two parallel trees — `react/stores/`
 * (Core-owned, chrome-agnostic slices) and `react/studio/state/`
 * (AnvilKit-chrome state + registries) — into one location so there is
 * exactly one answer to "where does Studio state live?".
 *
 * The Core-vs-chrome distinction is preserved at the *symbol* level, not
 * the directory level — see `./README.md` for the rule on where a new
 * store belongs.
 *
 * - **Core-owned, chrome-agnostic slices** (readable on the legacy
 *   `chrome="puck"` path too): {@link useThemeStore}, {@link useExportStore},
 *   {@link useAiStore}. Each is a per-instance factory wired via its
 *   `*StoreProvider`; persisted keys are namespaced by `storeId`.
 * - **Editor-UI slice** (AnvilKit chrome): {@link useEditorUiStore} +
 *   selector hooks.
 * - **Coordinated bundle**: {@link createEditorStore} bundles the four
 *   editor slices for the single-gate {@link EditorStoreProvider}.
 * - **Chrome wiring**: sidebar registry, i18n message context, and the
 *   instance root provider.
 *
 * Plugins never import these hooks directly — the write path is lifecycle
 * events (see `core-013`).
 */

// ---------------------------------------------------------------------------
// Chrome wiring: i18n message context, sidebar registry, instance root
// ---------------------------------------------------------------------------
export {
	EditorI18nProvider,
	type EditorI18nProviderProps,
	useMsg,
} from "./editor-i18n-context";
export {
	SidebarRegistryProvider,
	type SidebarRegistryProviderProps,
	useSidebarRegistryStoreApi,
	useSidebarRegistryStoreApiOrNull,
} from "./sidebar-registry/SidebarRegistryProvider";
export {
	createSidebarRegistryStore,
	type SidebarRegistryState,
	type SidebarRegistryStoreApi,
} from "./sidebar-registry/sidebar-registry-store";
export { useSidebarRegistry } from "./sidebar-registry/use-sidebar-registry";
// ---------------------------------------------------------------------------
// Core-owned, chrome-agnostic slices (theme / export / ai)
// ---------------------------------------------------------------------------
export {
	AiStoreProvider,
	type AiStoreProviderProps,
	useAiStore,
	useAiStoreApi,
} from "./slices/AiStoreProvider";
export {
	type AiHistoryEntry,
	type AiState,
	type AiStoreApi,
	type CreateAiStoreOptions,
	createAiStore,
} from "./slices/ai-store";
// ---------------------------------------------------------------------------
// Editor-UI slice (AnvilKit chrome) + coordinated editor-store bundle
// ---------------------------------------------------------------------------
export {
	EditorUiStoreProvider,
	type EditorUiStoreProviderProps,
	useEditorUiStoreApi,
} from "./slices/EditorUiStoreProvider";
export {
	ExportStoreProvider,
	type ExportStoreProviderProps,
	useExportStore,
	useExportStoreApi,
} from "./slices/ExportStoreProvider";
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
} from "./slices/editor-ui-selectors";
export {
	type AssetCategoryFilter,
	type ComponentViewMode,
	type CopyCategoryFilter,
	type CreateEditorUiStoreOptions,
	createEditorUiStore,
	EDITOR_UI_STORE_PERSIST_VERSION,
	type EditorTab,
	type EditorUiState,
	type EditorUiStoreApi,
} from "./slices/editor-ui-store";
export {
	type CreateExportStoreOptions,
	createExportStore,
	type ExportState,
	type ExportStoreApi,
	type LastExportRecord,
} from "./slices/export-store";
export {
	LocaleStoreProvider,
	type LocaleStoreProviderProps,
	useLocaleStore,
	useLocaleStoreApi,
	useOptionalLocale,
} from "./slices/LocaleStoreProvider";
export {
	type CreateLocaleStoreOptions,
	createLocaleStore,
	type LocaleState,
	type LocaleStoreApi,
} from "./slices/locale-store";
export {
	ThemeStoreProvider,
	type ThemeStoreProviderProps,
	useThemeStore,
	useThemeStoreApi,
} from "./slices/ThemeStoreProvider";
export {
	type CreateThemeStoreOptions,
	createThemeStore,
	type ThemeMode,
	type ThemeResolved,
	type ThemeState,
	type ThemeStoreApi,
} from "./slices/theme-store";
