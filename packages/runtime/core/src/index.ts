/**
 * @file Root barrel for `@anvilkit/core` — the package's public API
 * surface (task `core-015`).
 *
 * Every name reachable through `import { X } from "@anvilkit/core"`
 * passes through this file. The list is deliberately explicit rather
 * than `export *` so a PR that inadvertently widens (or narrows) the
 * public surface is impossible to miss in code review.
 *
 * ### Layer map
 *
 * The named exports below are grouped by the four M2–M5 layers:
 *
 * - **Types** — the pure TypeScript types plugin authors and host apps
 *   use to describe plugins, registrations, config, and domain records.
 *   Re-exported via `export type *` so the barrel stays free of runtime
 *   type imports.
 * - **Runtime** — the React-free plugin engine: `compilePlugins`, the
 *   error class family, the export registry + header-action composer,
 *   and the lifecycle manager factory. React never appears in this
 *   layer; the `scripts/check-react-free.mjs` quality gate enforces
 *   that at CI time.
 * - **Config** — the Zod schema, the layered-merge factory, the React
 *   provider, and the `useStudioConfig()` hook.
 * - **React** — the public `<Studio>` shell, `useStudio()` projection
 *   hook, `mergeOverrides` helper, and the three Zustand store hooks
 *   (`useExportStore` / `useAiStore` / `useThemeStore`).
 *
 * ### What is NOT re-exported
 *
 * `src/compat/ai-host-adapter.ts` — the legacy `aiHost` compat adapter
 * — is **intentionally absent** from this barrel. It is reachable only
 * at the `@anvilkit/core/compat` subpath so ESM tree-shaking can drop
 * it entirely from host bundles that never import it. The
 * `check-bundle-budget.mjs` script asserts the adapter is absent from
 * a build that imports only `{ Studio }`, resolving `core-010`
 * acceptance criterion #6.
 *
 * Internal primitives that are not part of the public contract — e.g.
 * `StudioRuntimeProvider`, `detectPlugin` internals, internal schema
 * helpers — are deliberately not surfaced here. Consumers who need a
 * deeper hook reach for the `@anvilkit/core/runtime`,
 * `@anvilkit/core/config`, or `@anvilkit/core/react` subpath barrels.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-015-public-api-gates.md | core-015}
 */

// ---------------------------------------------------------------------------
// Config (M4 — Zod schema, layered merge, React provider + hook)
// ---------------------------------------------------------------------------
export {
	type CreateStudioConfigOptions,
	createStudioConfig,
	parseStudioEnv,
	StudioConfigProvider,
	type StudioConfigProviderProps,
	StudioConfigSchema,
	useStudioConfig,
} from "./config/index.js";
// ---------------------------------------------------------------------------
// Export runner (P2 — first-party data→IR→run→download helper)
// ---------------------------------------------------------------------------
export {
	downloadExportResult,
	type ExportAndDownloadOptions,
	exportAndDownload,
	type RunExportOptions,
	runExport,
} from "./export/index.js";
// ---------------------------------------------------------------------------
// React (M5 — <Studio> shell, useStudio, mergeOverrides)
// ---------------------------------------------------------------------------
export {
	mergeOverrides,
	Studio,
	type StudioAnalyticsEventName,
	type StudioAnalyticsPort,
	StudioErrorScreen,
	type StudioErrorScreenProps,
	StudioLoadingScreen,
	type StudioLoadingScreenProps,
	type StudioLogger,
	type StudioProps,
	type UseStudioResult,
	useStudio,
} from "./react/index.js";
// ---------------------------------------------------------------------------
// Runtime (M3 — React-free plugin engine)
// ---------------------------------------------------------------------------
export {
	CORE_VERSION,
	compilePlugins,
	composeHeaderActions,
	createExportRegistry,
	createLifecycleManager,
	type ExportRegistry,
	type HeaderActionSlot,
	isPuckPlugin,
	isStudioPlugin,
	jsonFormat,
	type LifecycleEventName,
	type LifecycleManager,
	type LifecyclePhase,
	type LifecycleSubscriber,
	lazyPlugin,
	lazyPluginWith,
	type RegistrationTransform,
	resolveHeaderActionSlots,
	type SortableHeaderAction,
	StudioConfigError,
	StudioError,
	StudioExportError,
	StudioPluginError,
	type StudioPluginLoader,
	type StudioRuntime,
	type StudioSidebarContributions,
	withoutHeaderActions,
} from "./runtime/index.js";
// ---------------------------------------------------------------------------
// React stores (M5 — Studio-level Zustand slices)
// ---------------------------------------------------------------------------
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
} from "./state/index.js";
// ---------------------------------------------------------------------------
// Page-root SEO projection (PRD 0004 F4 — root.props ↔ StudioPage/SEO sidecar)
// ---------------------------------------------------------------------------
export {
	type PageRootInput,
	type PageRootSeoInput,
	pageRootSeoToStudioPageSeo,
	pageRootToStudioPageFields,
	studioPageSeoToPageRootSeo,
} from "./studio/context/page-root-seo.js";
// ---------------------------------------------------------------------------
// Types (M2 — plugin contract, config shape, domain records)
// ---------------------------------------------------------------------------
export type * from "./types/index.js";
// `defineStudioPlugin` is the single runtime *value* in the otherwise
// type-only types layer (a type-branding `as` cast helper). The
// `export type *` above re-exports it type-only, so it is unreachable
// as a callable value from the root barrel — surface it explicitly
// here so `import { defineStudioPlugin } from "@anvilkit/core"` works
// (review finding AR-d).
export { defineStudioPlugin } from "./types/plugin.js";
