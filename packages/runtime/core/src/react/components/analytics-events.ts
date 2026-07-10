/**
 * @file Pure emitters for the three `<Studio>`-owned system events (PRD 0004
 * F9). Each forwards ONLY lightweight, primitive props through the optional
 * adapter — never the full Puck `Data`, `root.props`, serialized HTML, or DOM
 * nodes (the forbidden-fields rule). A missing adapter makes every call a no-op.
 */

import type {
	StudioAnalyticsEventName,
	StudioAnalyticsPort,
} from "@/shared/analytics-port";

/** The minimal shape of a Puck "insert" action this module reads. */
export interface InsertActionLike {
	readonly type: string;
	readonly componentType?: string;
	readonly destinationZone?: string;
}

/** The minimal shape of a Puck `Data` this module reads (`root.props.seo`). */
export interface PageDataLike {
	readonly root?: { readonly props?: Record<string, unknown> };
}

/**
 * The SEO fields authored by the PageSeoPlugin (PRD §5.1). The diff in
 * {@link trackSeoUpdated} reports which of these changed — never their values.
 */
const SEO_FIELDS = [
	"title",
	"description",
	"ogImage",
	"canonical",
	"noIndex",
] as const;

function readSeo(
	data: PageDataLike | undefined,
): Readonly<Record<string, unknown>> {
	const seo = (data?.root?.props as { seo?: unknown } | undefined)?.seo;
	return seo !== null && typeof seo === "object"
		? (seo as Readonly<Record<string, unknown>>)
		: {};
}

/** `draft_saved` — fired when the host's save-draft handler resolves. */
export function trackDraftSaved(
	analytics: StudioAnalyticsPort | undefined,
	componentCount: number,
	durationMs: number,
): void {
	analytics?.track("draft_saved" satisfies StudioAnalyticsEventName, {
		component_count: componentCount,
		duration_ms: durationMs,
	});
}

/** `page_published` — fired after a publish completes. */
export function trackPagePublished(
	analytics: StudioAnalyticsPort | undefined,
	statusChange: string,
): void {
	analytics?.track("page_published" satisfies StudioAnalyticsEventName, {
		status_change: statusChange,
	});
}

/**
 * `component_dropped` — fired on a Puck `insert` action only; other actions
 * (move/remove/reorder/…) are ignored.
 */
export function trackComponentDropped(
	analytics: StudioAnalyticsPort | undefined,
	action: InsertActionLike,
): void {
	if (action.type !== "insert") return;
	analytics?.track("component_dropped" satisfies StudioAnalyticsEventName, {
		component_type: action.componentType ?? "unknown",
		zone: action.destinationZone ?? "default",
	});
}

/**
 * `seo_updated` — fired when any `root.props.seo` field changes between two
 * editor documents (the seam through which a PageSeoPlugin edit dispatches an
 * immutable root update). Emits only the changed field NAMES — never the field
 * values, the surrounding `root.props`, or the full document.
 *
 * `modified_fields` is a comma-joined string, not an array: the transport's
 * `sanitizeProperties` (the forbidden-fields rule) keeps only
 * `string | number | boolean`, so an array value would be silently dropped.
 */
export function trackSeoUpdated(
	analytics: StudioAnalyticsPort | undefined,
	prev: PageDataLike | undefined,
	next: PageDataLike | undefined,
): void {
	if (analytics === undefined) return;
	const prevSeo = readSeo(prev);
	const nextSeo = readSeo(next);
	const modifiedFields = SEO_FIELDS.filter(
		(field) => prevSeo[field] !== nextSeo[field],
	);
	if (modifiedFields.length === 0) return;
	analytics.track("seo_updated" satisfies StudioAnalyticsEventName, {
		modified_fields: modifiedFields.join(","),
	});
}

/**
 * `plugin_toggled` — fired when a sidebar rail module is opened (switched to /
 * re-expanded) or closed (the active module's panel collapsed). `pluginName`
 * is the rail module key; `state` is the resulting open/closed state.
 */
export function trackPluginToggled(
	analytics: StudioAnalyticsPort | undefined,
	pluginName: string,
	state: "opened" | "closed",
): void {
	analytics?.track("plugin_toggled" satisfies StudioAnalyticsEventName, {
		plugin_name: pluginName,
		state,
	});
}
