/**
 * @file React hooks for reading the validated {@link StudioConfig}
 * from within a `<StudioConfigProvider>` subtree (task `core-012`).
 *
 * Separating `hooks.ts` from `provider.tsx` keeps the hook module a
 * plain `.ts` file — no JSX — which makes it trivially importable in
 * contexts where the JSX-enabled transformer is not in play (e.g.
 * lightweight type-only consumers or forthcoming server runtimes).
 *
 * ### Selector overload
 *
 * The hook is surfaced as two overloads:
 *
 * 1. `useStudioConfig()` — returns the full {@link StudioConfig}.
 * 2. `useStudioConfig(selector)` — projects the config through the
 *    selector and returns the narrowed slice.
 *
 * Selectors are the recommended shape for reads that only care about
 * a handful of fields (`c => c.features.enableExport`). A callback
 * surface is easier to evolve than `useStudioConfigSlice(path)` or
 * an object-based `pick` helper — arbitrary projections, type-safe
 * inference, no runtime path parsing.
 *
 * ### Memoization trade-off
 *
 * The hook wraps the selector call in `useMemo` keyed on
 * `[config, selector]`. This is intentionally loose:
 *
 * - **Pros:** primitive selectors that re-run every render (`c =>
 *   c.features.enableExport`) still return a stable primitive, and
 *   object-returning selectors are recomputed only when either the
 *   config or the selector reference changes — matching typical
 *   React selector patterns.
 * - **Cons:** a fresh inline selector (`c => ({ ...c.features })`)
 *   recomputes on every render. That's fine today because the
 *   config object is static after `createStudioConfig()` runs, so
 *   the recomputation is cheap and does nothing downstream.
 *
 * If subscription-level granularity becomes a concern later, the
 * reference repo has a `use-context-selector` migration documented
 * in `docs/plans/core-development-plan.md` §4.5. Not now.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-012-config-provider-hooks.md | core-012}
 */

import { useMemo } from "react";

import type { StudioConfig } from "../types/config.js";
import { useStudioConfigContext } from "./provider.js";

/**
 * Read the full {@link StudioConfig} from the nearest
 * {@link StudioConfigProvider}. Throws if no provider is mounted
 * above the caller — the error message is surfaced by
 * `getStrictContext` and contains the string `"StudioConfig"`.
 *
 * @example
 * function Header() {
 *   const config = useStudioConfig();
 *   return <h1>{config.branding.appName}</h1>;
 * }
 */
export function useStudioConfig(): StudioConfig;
/**
 * Read a projection of {@link StudioConfig} through `selector`. The
 * result is memoized by `[config, selector]` — see the file header
 * for the trade-off behind that key.
 *
 * @param selector - Pure function that picks a slice of the config.
 *   Inline arrow functions are fine; the memo guards cheap
 *   primitives and object references stay stable as long as both
 *   the config and the selector reference are unchanged.
 * @returns The slice produced by `selector(config)`.
 *
 * @example
 * const enableExport = useStudioConfig((c) => c.features.enableExport);
 */
export function useStudioConfig<T>(selector: (config: StudioConfig) => T): T;
export function useStudioConfig<T>(
	selector?: (config: StudioConfig) => T,
): StudioConfig | T {
	const config = useStudioConfigContext();
	return useMemo(
		() => (selector ? selector(config) : config),
		[config, selector],
	);
}
