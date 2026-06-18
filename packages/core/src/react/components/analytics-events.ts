/**
 * @file Pure emitters for the three `<Studio>`-owned system events (PRD 0004
 * F9). Each forwards ONLY lightweight, primitive props through the optional
 * adapter — never the full Puck `Data`, `root.props`, serialized HTML, or DOM
 * nodes (the forbidden-fields rule). A missing adapter makes every call a no-op.
 */

import type {
	AnalyticsAdapter,
	AnalyticsEventName,
} from "@anvilkit/analytics-core";

/** The minimal shape of a Puck "insert" action this module reads. */
export interface InsertActionLike {
	readonly type: string;
	readonly componentType?: string;
	readonly destinationZone?: string;
}

/** `draft_saved` — fired when the host's save-draft handler resolves. */
export function trackDraftSaved(
	analytics: AnalyticsAdapter | undefined,
	componentCount: number,
	durationMs: number,
): void {
	analytics?.track("draft_saved" satisfies AnalyticsEventName, {
		component_count: componentCount,
		duration_ms: durationMs,
	});
}

/** `page_published` — fired after a publish completes. */
export function trackPagePublished(
	analytics: AnalyticsAdapter | undefined,
	statusChange: string,
): void {
	analytics?.track("page_published" satisfies AnalyticsEventName, {
		status_change: statusChange,
	});
}

/**
 * `component_dropped` — fired on a Puck `insert` action only; other actions
 * (move/remove/reorder/…) are ignored.
 */
export function trackComponentDropped(
	analytics: AnalyticsAdapter | undefined,
	action: InsertActionLike,
): void {
	if (action.type !== "insert") return;
	analytics?.track("component_dropped" satisfies AnalyticsEventName, {
		component_type: action.componentType ?? "unknown",
		zone: action.destinationZone ?? "default",
	});
}
