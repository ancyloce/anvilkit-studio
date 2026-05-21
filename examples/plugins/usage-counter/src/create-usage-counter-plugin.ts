import type { Data as PuckData } from "@puckeditor/core";

import type {
	StudioHeaderAction,
	StudioPluginContext,
	StudioPluginMeta,
	StudioPluginRegistration,
} from "@anvilkit/core/types";

import type {
	UsageCounterOptions,
	UsageCounterPlugin,
	UsageCounts,
	UsageCountsListener,
} from "./types.js";

const META: StudioPluginMeta = {
	id: "anvilkit-example-usage-counter",
	name: "Component Usage Counter",
	version: "0.1.0",
	coreVersion: "^0.1.0-alpha",
	description:
		"Counts how many times each component appears on the page; surfaces the totals through the plugin event bus and an optional header action.",
};

/**
 * Walk a Puck `Data` tree and count occurrences of each
 * `component.type` string, including components inside named zones.
 */
function computeCounts(data: PuckData): UsageCounts {
	const counts: Record<string, number> = {};

	for (const item of data.content) {
		counts[item.type] = (counts[item.type] ?? 0) + 1;
	}

	const zones = data.zones ?? {};
	for (const zoneKey of Object.keys(zones)) {
		const zoneItems = zones[zoneKey] ?? [];
		for (const item of zoneItems) {
			counts[item.type] = (counts[item.type] ?? 0) + 1;
		}
	}

	return counts;
}

/**
 * Create a usage-counter plugin instance.
 *
 * Tracks `component.type → instance count` on every Puck
 * `onChange` and exposes the totals through:
 *
 * 1. `getCounts()` — synchronous snapshot for host UI.
 * 2. `subscribe(fn)` — push notifications for reactive UIs.
 * 3. `ctx.emit("usage-counter:update", counts)` — for other plugins.
 * 4. `headerActions[0]` — a "Log usage counts" button useful for
 *    debugging and as a demo of the header-action contract.
 */
export function createUsageCounterPlugin(
	opts: UsageCounterOptions = {},
): UsageCounterPlugin {
	let counts: UsageCounts = {};
	const listeners = new Set<UsageCountsListener>();

	function update(next: UsageCounts, ctx: StudioPluginContext): void {
		counts = next;
		if (opts.verbose) {
			ctx.log("debug", "usage-counter:update", { counts });
		}
		ctx.emit("usage-counter:update", counts);
		for (const listener of listeners) {
			try {
				listener(counts);
			} catch (error) {
				ctx.log("error", "usage-counter listener threw", { error });
			}
		}
	}

	const logCountsAction: StudioHeaderAction = {
		id: "usage-counter-log",
		label: "Log usage counts",
		icon: "list",
		group: "overflow",
		onClick(ctx) {
			ctx.log("info", "usage-counter:snapshot", { counts });
		},
	};

	const plugin: UsageCounterPlugin = {
		meta: META,
		register(_ctx): StudioPluginRegistration {
			return {
				meta: META,
				hooks: {
					onInit(ctx) {
						update(computeCounts(ctx.getData()), ctx);
					},
					onDataChange(ctx, data) {
						update(computeCounts(data), ctx);
					},
				},
				headerActions: [logCountsAction],
			};
		},
		getCounts: () => counts,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};

	return plugin;
}
