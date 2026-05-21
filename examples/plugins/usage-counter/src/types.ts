import type { StudioPlugin } from "@anvilkit/core/types";

/**
 * Map of `componentType → number-of-instances` produced by the
 * usage counter plugin.
 *
 * Keys are the component `type` strings as they appear in
 * `data.content[].type` (e.g. `"Hero"`, `"Button"`). Components in
 * Puck zones are also counted. The map is recomputed from scratch on
 * every {@link StudioPluginLifecycleHooks.onDataChange} so it always
 * reflects the latest snapshot — never stale.
 */
export type UsageCounts = Readonly<Record<string, number>>;

/**
 * Listener signature subscribed via
 * {@link UsageCounterPlugin.subscribe}.
 */
export type UsageCountsListener = (counts: UsageCounts) => void;

/**
 * Optional knobs accepted by {@link createUsageCounterPlugin}.
 */
export interface UsageCounterOptions {
	/**
	 * If `true`, every recompute also routes through
	 * `ctx.log("debug", "usage-counter:update", { counts })`. Off by
	 * default to keep host consoles clean.
	 */
	readonly verbose?: boolean;
}

/**
 * The plugin object returned by {@link createUsageCounterPlugin}.
 *
 * Exposes the usual `StudioPlugin` surface plus a small
 * read/subscribe API so host apps and tests can observe live counts
 * without going through the event bus.
 */
export interface UsageCounterPlugin extends StudioPlugin {
	/**
	 * Snapshot of the most recent counts. Returns an empty object
	 * before the first `onDataChange` fires.
	 */
	readonly getCounts: () => UsageCounts;
	/**
	 * Register a listener that fires every time counts change.
	 * Returns an unsubscribe function (idempotent).
	 */
	readonly subscribe: (listener: UsageCountsListener) => () => void;
}
