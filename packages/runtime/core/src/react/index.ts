// Barrel for `@anvilkit/core/react`.
//
// Populated by:
// - core-013 → Zustand stores (`stores/{export,ai,theme}-store.ts`)
//              for Studio-level state slices.
// - core-014 → `<Studio>`, `useStudio`, and the curried per-key
//              override merge helper.
//
// Note: `src/config/` also imports React (provider + hook from
// core-012). The rule is not "only react/ touches React" but
// "React is scoped to the two domains that own it" — config/ owns
// the host config read path, react/ owns the Studio shell and its
// slice stores.

export type {
	StudioAnalyticsEventName,
	StudioAnalyticsPort,
} from "../shared/analytics-port";
export {
	type AiHistoryEntry,
	type AiState,
	type AiStoreApi,
	AiStoreProvider,
	type AiStoreProviderProps,
	type CreateAiStoreOptions,
	type CreateExportStoreOptions,
	type CreateThemeStoreOptions,
	createAiStore,
	createExportStore,
	createThemeStore,
	type ExportState,
	type ExportStoreApi,
	ExportStoreProvider,
	type ExportStoreProviderProps,
	type LastExportRecord,
	type ThemeMode,
	type ThemeResolved,
	type ThemeState,
	type ThemeStoreApi,
	ThemeStoreProvider,
	type ThemeStoreProviderProps,
	useAiStore,
	useAiStoreApi,
	useExportStore,
	useExportStoreApi,
	useThemeStore,
	useThemeStoreApi,
} from "../state/index";
export {
	StudioErrorScreen,
	type StudioErrorScreenProps,
} from "../studio/layout/StudioErrorScreen";
export {
	StudioLoadingScreen,
	type StudioLoadingScreenProps,
} from "../studio/layout/StudioLoadingScreen";
export {
	Studio,
	type StudioLogger,
	type StudioProps,
} from "./components/Studio";
export {
	StudioErrorBoundary,
	type StudioErrorBoundaryProps,
} from "./components/StudioErrorBoundary";
export { type UseStudioResult, useStudio } from "./components/use-studio";
export { mergeOverrides } from "./overrides/merge-overrides";
