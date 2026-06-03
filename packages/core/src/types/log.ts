/**
 * @file Leaf module for the shared {@link StudioLogLevel} union.
 *
 * Hoisted out of `plugin.ts` so `sidebar.ts` can reference the real type
 * instead of duplicating the union inline: `plugin.ts` imports from
 * `sidebar.ts`, so `sidebar.ts` importing `StudioLogLevel` back from
 * `plugin.ts` formed a madge cycle. This module imports nothing, so both
 * `plugin.ts` and `sidebar.ts` can depend on it cycle-free.
 */

/**
 * Severity level for {@link StudioPluginContext.log} and
 * {@link StudioAssetAction.run}'s `log`.
 *
 * Follows the conventional `debug` < `info` < `warn` < `error`
 * ordering. The runtime may route different levels to different sinks
 * (e.g. `error` to a host-provided error reporter).
 */
export type StudioLogLevel = "debug" | "info" | "warn" | "error";
