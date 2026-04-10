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
// Types (M2 — plugin contract, config shape, domain records)
// ---------------------------------------------------------------------------
export type * from "./types/index.js";

// ---------------------------------------------------------------------------
// Runtime (M3 — React-free plugin engine)
// ---------------------------------------------------------------------------
export {
	CORE_VERSION,
	type ExportRegistry,
	type LifecycleEventName,
	type LifecycleManager,
	type LifecycleSubscriber,
	type StudioRuntime,
	compilePlugins,
	composeHeaderActions,
	createExportRegistry,
	createLifecycleManager,
	isPuckPlugin,
	isStudioPlugin,
	StudioConfigError,
	StudioError,
	StudioExportError,
	StudioPluginError,
} from "./runtime/index.js";

// ---------------------------------------------------------------------------
// Config (M4 — Zod schema, layered merge, React provider + hook)
// ---------------------------------------------------------------------------
export {
	type CreateStudioConfigOptions,
	type StudioConfigProviderProps,
	createStudioConfig,
	parseStudioEnv,
	StudioConfigProvider,
	StudioConfigSchema,
	useStudioConfig,
} from "./config/index.js";

// ---------------------------------------------------------------------------
// React (M5 — <Studio> shell, useStudio, mergeOverrides)
// ---------------------------------------------------------------------------
export {
	type StudioProps,
	type UseStudioResult,
	Studio,
	mergeOverrides,
	useStudio,
} from "./react/index.js";

// ---------------------------------------------------------------------------
// React stores (M5 — Studio-level Zustand slices)
// ---------------------------------------------------------------------------
export {
	type AiHistoryEntry,
	type AiState,
	type ExportState,
	type LastExportRecord,
	type ThemeMode,
	type ThemeResolved,
	type ThemeState,
	useAiStore,
	useExportStore,
	useThemeStore,
} from "./react/stores/index.js";
