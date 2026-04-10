/**
 * @file Barrel for `@anvilkit/core`'s Zustand stores (task `core-013`).
 *
 * Three Studio-level slices live here:
 *
 * - {@link useExportStore} — export pipeline state (available formats,
 *   current selection, in-flight flag, last-result record).
 * - {@link useAiStore} — AI generation state (in-flight flag, last
 *   prompt / error, bounded prompt history).
 * - {@link useThemeStore} — theme preference (user-picked mode plus
 *   the resolved `light` / `dark` value currently on screen).
 *
 * ### Scope — what lives here and what does not
 *
 * Per architecture §12 ("State Ownership"), these three slices are
 * **Core-owned** Studio-level concerns that are neither Puck's
 * (`appState.data`, drag/drop) nor the host's (credentials, feature
 * flags). Plugin-local state stays inside each plugin factory; the
 * host's `StudioConfig` stays in `config/` and is read via
 * `useStudioConfig()` (`core-012`), not through a store.
 *
 * ### Plugin write path
 *
 * **Plugins never import these hooks.** The write path is lifecycle
 * events — plugins emit `beforeExport`, `afterExport`, `onAiStart`,
 * `onAiFinish`, etc., and `<Studio>` (wired in `core-014`) subscribes
 * to those events and calls the appropriate store setter. Keeping the
 * write path indirect is what lets plugins stay decoupled from the
 * Studio shell — a plugin that imported `useExportStore` directly
 * would break in any host that composed it without a `<Studio>` root.
 *
 * The acceptance criterion at the bottom of `core-013` is explicit:
 * no file in `src/react/stores/` may import from `@anvilkit/plugins`
 * or `@anvilkit/ui`. Stores are pure state, not UI and not plugin
 * code.
 *
 * ### Module-level singletons
 *
 * Every Zustand store here is a module-scoped singleton. Two
 * `<Studio>` components mounted on the same page therefore share
 * state — an intentional MVP trade-off documented in `core-013`. A
 * future `StudioScope` / React-context-keyed store factory is
 * possible but is explicitly out of scope for the 0.1.x line.
 *
 * ### Persistence
 *
 * Each store uses `zustand/middleware`'s `persist` with a
 * `anvilkit-core-*` key prefix and a `partialize` that allows **only**
 * the fields the spec calls out. Ephemeral fields (`isExporting`,
 * `isGenerating`, `lastError`, `lastExport`) are deliberately excluded
 * so a page reload never lands the UI in a "still in-flight" state
 * against a server that has long since forgotten the request.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-013-react-stores.md | core-013}
 */

export { useAiStore, type AiState, type AiHistoryEntry } from "./ai-store.js";
export {
	useExportStore,
	type ExportState,
	type LastExportRecord,
} from "./export-store.js";
export {
	useThemeStore,
	type ThemeMode,
	type ThemeResolved,
	type ThemeState,
} from "./theme-store.js";
