/**
 * @file React hook + strict context for reading the compiled
 * {@link StudioRuntime} from inside `<Studio>` (task `core-014`).
 *
 * Two exports live here:
 *
 * - {@link StudioRuntimeProvider} — the typed React context provider
 *   used by `<Studio>` to publish the compiled runtime to its
 *   descendants. Not exported from the package barrel; consumers use
 *   `<Studio>` itself, not the raw provider.
 * - {@link useStudio} — the public consumer-facing hook. Returns the
 *   diagnostic projection the task spec pins (`plugins`,
 *   `exportFormats`, `headerActions`). Anything richer is read by
 *   subscribing to the Zustand stores or by using {@link useStudioRuntime}
 *   directly from inside `<Studio>`.
 *
 * ### Why a projection rather than the full runtime?
 *
 * `StudioRuntime` owns `lifecycle`, `overrides`, and `puckPlugins`
 * alongside the diagnostic fields. Those are implementation details
 * `<Studio>` consumes once at mount — exposing them through a public
 * hook would invite consumers to call `useStudio().lifecycle.emit(...)`
 * and race against `<Studio>`'s own emit calls. The curated projection
 * pins the read-only surface at "which plugins are mounted, what can I
 * export, what header actions exist" and hides the write-side knobs.
 *
 * ### Strict context contract
 *
 * `getStrictContext<StudioRuntime>("Studio")` gives us the usual
 * "called outside provider" error with a useful stack trace, via the
 * helper documented at `packages/utils/src/get-strict-context.ts`. The
 * context `displayName` is `"Studio"` — the missing-provider error
 * reads `` `useStudio` must be used within <StudioProvider>. ``, which
 * matches the `core-014` acceptance criterion.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-014-studio-component.md | core-014}
 */

import { useMemo } from "react";
import { getStrictContext } from "@anvilkit/utils";

import type { StudioRuntime } from "../../runtime/compile-plugins.js";

/**
 * Strict context pair for the compiled {@link StudioRuntime}.
 *
 * - {@link StudioRuntimeProvider} — re-exported below so `<Studio>`
 *   can wrap its children.
 * - `useStudioRuntime` — the raw accessor used internally by the
 *   `<Studio>` component to read the full runtime shape. Not exported
 *   from the package barrel; public consumers use {@link useStudio}.
 */
const [StudioRuntimeProvider, useStudioRuntime] =
	getStrictContext<StudioRuntime>("Studio");

export { StudioRuntimeProvider, useStudioRuntime };

/**
 * Diagnostic projection of the compiled runtime, exposed to host
 * apps and plugin UIs.
 *
 * Kept deliberately small: the fields here are all read-only
 * descriptors plus two registries (`exportFormats`, `headerActions`).
 * Any mutation path goes through the Zustand stores or through
 * `<Studio>`'s own lifecycle wiring — a consumer calling
 * `useStudio()` cannot trigger a publish, a data change, or an
 * export run from the return value.
 */
export interface UseStudioResult {
	/**
	 * The `meta` block of every {@link StudioPlugin} that successfully
	 * registered, in declaration order. Suitable for a "plugins
	 * loaded" diagnostic panel; not suitable for plugin-to-plugin
	 * communication (use the lifecycle event bus for that).
	 */
	readonly plugins: StudioRuntime["pluginMeta"];
	/**
	 * Registered export formats indexed by
	 * {@link ExportFormatDefinition.id}. Reading the keys gives the
	 * host app the same list `useExportStore.getState().availableFormats`
	 * exposes, minus the reactivity — consumers that need reactive
	 * re-renders should subscribe to the export store instead.
	 */
	readonly exportFormats: StudioRuntime["exportFormats"];
	/**
	 * Header action descriptors in plugin registration order.
	 * `composeHeaderActions()` (`core-009`) turns these into rendered
	 * React nodes at the header level — this field gives consumers
	 * the raw data for custom UIs.
	 */
	readonly headerActions: StudioRuntime["headerActions"];
}

/**
 * Read the compiled {@link StudioRuntime}'s diagnostic projection
 * from inside a `<Studio>` subtree.
 *
 * Throws a descriptive error if called outside `<Studio>` — the
 * error message contains the literal string `"Studio"` so host apps
 * can pattern-match it in tests if needed.
 *
 * @returns The {@link UseStudioResult} projection of the runtime.
 *
 * @example
 * ```tsx
 * function PluginBadge() {
 *   const { plugins } = useStudio();
 *   return <span>{plugins.length} plugins loaded</span>;
 * }
 * ```
 */
export function useStudio(): UseStudioResult {
	const runtime = useStudioRuntime();
	// Memoize the projection keyed on `runtime`. Consumers who
	// destructure and pass `plugins`, `exportFormats`, or
	// `headerActions` into memoized children should not re-render
	// those children on every parent render just because `useStudio()`
	// returned a fresh outer object. The runtime reference is stable
	// for the life of a given compiled state, so this is near-free.
	return useMemo(
		() => ({
			plugins: runtime.pluginMeta,
			exportFormats: runtime.exportFormats,
			headerActions: runtime.headerActions,
		}),
		[runtime],
	);
}
