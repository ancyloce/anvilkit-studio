/**
 * @file Zustand store for Studio theme preference (task `core-013`).
 *
 * Holds two fields:
 *
 * - {@link ThemeState.mode} — the user's **preference**: `"light"`,
 *   `"dark"`, or `"system"` (track the OS).
 * - {@link ThemeState.resolved} — the **actual** mode currently on
 *   screen: `"light"` or `"dark"`. Derived from `mode` plus
 *   `matchMedia("(prefers-color-scheme: dark)")` at `<Studio>`
 *   mount time (`core-014`).
 *
 * Splitting preference from resolved value lets the header's theme
 * toggle read `mode` (to highlight the right button) while the
 * styling layer reads `resolved` (to pick a class). A single
 * combined field would force every consumer to re-implement the
 * same branching.
 *
 * ### Persistence
 *
 * Only {@link ThemeState.mode} is persisted under the key
 * `anvilkit-core-theme`. `resolved` is intentionally dropped on
 * rehydration because:
 *
 * 1. The user may have changed their OS preference while the tab
 *    was closed, so a persisted `resolved` could immediately
 *    contradict `matchMedia`.
 * 2. SSR cannot compute `resolved` — `matchMedia` is browser-only
 *    — so a persisted value would create a hydration mismatch.
 *
 * `<Studio>` calls {@link ThemeState.setResolved} once at mount
 * with the result of the media query, and again inside a
 * `change` listener so live OS theme changes flow through.
 *
 * ### Default
 *
 * Initial `mode` is `"system"`, matching `StudioConfigSchema`'s
 * `theme.defaultMode` default. The two defaults are kept in sync
 * by hand because the schema is authoritative for host config and
 * the store is authoritative for runtime preference — but they
 * should never disagree. If the schema default ever changes,
 * update {@link INITIAL_STATE} here in the same PR.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-013-react-stores.md | core-013}
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The user-facing theme preference. Matches the enum in
 * `StudioConfigSchema.theme.defaultMode` exactly — if one changes,
 * update both.
 */
export type ThemeMode = "light" | "dark" | "system";

/**
 * The resolved on-screen theme. Only two values because `"system"`
 * is a preference, not a concrete style — it always resolves to
 * `"light"` or `"dark"` at render time.
 */
export type ThemeResolved = "light" | "dark";

/**
 * Full shape of the theme store — two read fields, two setters.
 * No `reset()` is required by the spec, but we add one for
 * parity with the other two stores and so tests have a uniform
 * isolation hook.
 */
export interface ThemeState {
	/**
	 * The user's declared preference. Persisted.
	 */
	readonly mode: ThemeMode;
	/**
	 * The theme currently rendered on screen. **Never persisted**
	 * — recomputed at mount from `matchMedia` and updated on every
	 * OS-level preference change. See file header for rationale.
	 */
	readonly resolved: ThemeResolved;
	/**
	 * Update the user's preference. Typically called from the
	 * header's theme-toggle button.
	 */
	setMode(mode: ThemeMode): void;
	/**
	 * Update the resolved on-screen value. Called once at mount
	 * with `matchMedia("(prefers-color-scheme: dark)").matches`
	 * and again from a `change` listener inside `<Studio>`.
	 */
	setResolved(resolved: ThemeResolved): void;
	/**
	 * Restore every field to its initial state. Present for
	 * symmetry with the other stores in this directory — see
	 * {@link ExportState.reset}.
	 */
	reset(): void;
}

/**
 * Persisted slice shape — `mode` only. Declared explicitly so a
 * field rename fails to compile here instead of silently dropping
 * the persisted value.
 */
interface ThemeStorePartial {
	readonly mode: ThemeMode;
}

/**
 * Immutable initial state. `mode` defaults to `"system"` to match
 * `StudioConfigSchema`; `resolved` is seeded to `"light"` as a
 * sane pre-mount fallback that any subsequent
 * `setResolved(matchMedia(...).matches ? "dark" : "light")` call
 * overwrites almost immediately.
 */
const INITIAL_STATE = {
	mode: "system" as ThemeMode,
	resolved: "light" as ThemeResolved,
} as const;

/**
 * Zustand store for Studio theme preference.
 *
 * @example
 * // Header toggle:
 * const mode = useThemeStore((s) => s.mode);
 * const setMode = useThemeStore((s) => s.setMode);
 *
 * // Root style layer:
 * const resolved = useThemeStore((s) => s.resolved);
 * return <div className={`anvilkit-${resolved}`}>{children}</div>;
 */
export const useThemeStore = create<ThemeState>()(
	persist(
		(set) => ({
			...INITIAL_STATE,
			setMode(mode) {
				set({ mode });
			},
			setResolved(resolved) {
				set({ resolved });
			},
			reset() {
				set({ ...INITIAL_STATE });
			},
		}),
		{
			name: "anvilkit-core-theme",
			// Persist `mode` only. See the file header for why
			// `resolved` cannot and should not be persisted.
			partialize: (state): ThemeStorePartial => ({
				mode: state.mode,
			}),
			// SSR safety: skip synchronous rehydration so the server
			// and first-client render agree on the initial `"system"`
			// default. `<Studio>` rehydrates from a mount-time effect,
			// after which `mode` reflects the persisted preference.
			skipHydration: true,
		},
	),
);
