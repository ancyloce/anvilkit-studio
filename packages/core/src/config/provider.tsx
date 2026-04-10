/**
 * @file React provider for the validated `StudioConfig` (architecture
 * §9, task `core-012`).
 *
 * Wraps `@anvilkit/utils`' `getStrictContext` so the hook in
 * `./hooks.ts` throws a loud, actionable error when it is used outside
 * `<StudioConfigProvider>` — a missing provider is a programmer bug,
 * not a runtime degradation.
 *
 * ### Placement
 *
 * This is the first `.tsx` file in `@anvilkit/core`. It lives under
 * `src/config/` (not `src/react/`) because the config domain owns the
 * provider: the hook is the read path for the object `createStudioConfig`
 * produces, so keeping them colocated matches the module boundary
 * `docs/plans/core-development-plan.md` §4.5 draws.
 *
 * ### Why a strict context
 *
 * The default React context behavior (return the `defaultValue` when
 * no provider is mounted) silently papers over the most common bug in
 * this layer — a component being rendered outside `<Studio>`. The
 * {@link getStrictContext} helper uses a unique symbol sentinel so the
 * hook can distinguish "no provider" from "provider supplied
 * `undefined`" and throw with a stack trace pointing at the real
 * caller.
 *
 * ### Intentional omissions
 *
 * - No `React.memo` or `useDeferredValue` — the config object is
 *   static after `createStudioConfig()` runs, so optimization adds
 *   complexity without buying anything.
 * - No mutation API — config is immutable once validated. Hosts
 *   wanting live config changes must rebuild their tree.
 * - No nested-provider merging — one `<StudioConfigProvider>` per
 *   `<Studio>`. Nesting is explicitly out of scope for `core-012`.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-012-config-provider-hooks.md | core-012}
 */

import { getStrictContext } from "@anvilkit/utils";
import type { ReactNode } from "react";

import type { StudioConfig } from "../types/config.js";

/**
 * Strict context pair for {@link StudioConfig}. The tuple is
 * destructured into:
 *
 * - `StudioConfigContextProvider` — the raw React `Provider` element,
 *   wrapped below by {@link StudioConfigProvider} so host apps get a
 *   stable, named component instead of a tuple slot.
 * - {@link useStudioConfigContext} — the throw-if-missing hook
 *   re-exported at the bottom of this file so `./hooks.ts` can layer
 *   its selector-enabled {@link useStudioConfig} on top.
 *
 * The string `"StudioConfig"` is both the context `displayName`
 * (visible in React DevTools) and the identifier embedded in the
 * missing-provider error message — it must contain `"StudioConfig"`
 * verbatim to satisfy the `core-012` acceptance criterion.
 */
const [StudioConfigContextProvider, useStudioConfigContext] =
	getStrictContext<StudioConfig>("StudioConfig");

/**
 * Props for {@link StudioConfigProvider}.
 *
 * Both fields are required — the provider never fabricates a default
 * config, and a childless provider is a bug the type system should
 * catch at the call site.
 */
export interface StudioConfigProviderProps {
	/**
	 * The validated config object returned by `createStudioConfig()`.
	 * Treated as deeply read-only; callers that mutate it are in
	 * undefined-behavior territory.
	 */
	readonly config: StudioConfig;
	/**
	 * The React subtree that should have access to `config` via
	 * `useStudioConfig()`.
	 */
	readonly children: ReactNode;
}

/**
 * Make a validated {@link StudioConfig} available to descendants via
 * {@link useStudioConfig} (exported from `./hooks.ts`).
 *
 * @example
 * const config = createStudioConfig({ features: { enableAi: true } });
 *
 * return (
 *   <StudioConfigProvider config={config}>
 *     <Studio />
 *   </StudioConfigProvider>
 * );
 */
export function StudioConfigProvider({
	config,
	children,
}: StudioConfigProviderProps) {
	return (
		<StudioConfigContextProvider value={config}>
			{children}
		</StudioConfigContextProvider>
	);
}

/**
 * Internal accessor used by `./hooks.ts` to layer the selector-enabled
 * {@link useStudioConfig} on top. Host apps should import
 * `useStudioConfig` instead — this export exists only so the hook
 * file can stay a plain `.ts` module without duplicating the
 * `getStrictContext` wiring.
 */
export { useStudioConfigContext };
