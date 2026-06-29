/**
 * @file Pure published-page analytics aggregation (the read side). Turns the
 * stored, primitive-only `page_view` events into the page-level statistics the
 * `/api/analytics/stats` endpoint returns: views, unique visitors, sessions,
 * top referrers, and a per-day view series.
 *
 * Everything here is a pure function over an event array (`now` injected), so
 * the aggregation unit-tests deterministically under the node preset with no
 * Next/DOM. Preview traffic is excluded so it can never pollute real published
 * metrics (the client also skips emitting it — defence in depth).
 */

import type {
	PublishedAnalyticsEventRecord,
	StoredAnalyticsEvent,
} from "./types";

/** Referrer bucket label for visits with no/empty referrer. */
const DIRECT_REFERRER = "(direct)";

/** How many referrer buckets the endpoint returns. */
const TOP_REFERRERS_LIMIT = 10;

export interface StatsQuery {
	readonly slug?: string;
	readonly pageId?: string;
	/** A range token like `24h`, `7d`, `30d`, `90d`, or `all`. Defaults to `7d`. */
	readonly range?: string;
	/** Current time (ms). Injected so the window is deterministic in tests. */
	readonly now: number;
}

export interface PublishedPageStats {
	readonly pageId?: string;
	readonly slug?: string;
	readonly range: string;
	readonly views: number;
	readonly uniqueVisitors: number;
	readonly sessions: number;
	readonly topReferrers: ReadonlyArray<{ referrer: string; count: number }>;
	readonly viewsByDay: ReadonlyArray<{ date: string; views: number }>;
}

/** A primitive property read as a string, or `undefined` when absent/non-string. */
function strProp(event: StoredAnalyticsEvent, key: string): string | undefined {
	const value = event.properties?.[key];
	return typeof value === "string" ? value : undefined;
}

/**
 * Project a stored envelope into the logical {@link PublishedAnalyticsEventRecord}.
 * Identity + enrichment come from the envelope; `visitorId` / `slug` / `path` /
 * `referrer` ride in the primitive properties. The persisted envelope stays the
 * privacy-safe source of truth — this view is never itself stored.
 */
export function toPublishedRecord(
	event: StoredAnalyticsEvent,
): PublishedAnalyticsEventRecord {
	return {
		id: `${event.session_id}:${event.timestamp}:${event.event_name}`,
		eventName: event.event_name,
		source: event.source,
		pageId: event.page_id,
		slug: strProp(event, "slug"),
		path: strProp(event, "path"),
		referrer: strProp(event, "referrer"),
		// Prefer the persistent client session (properties) over the adapter's
		// per-page-load envelope id, so "sessions" reflects real 30-min sessions.
		sessionId: strProp(event, "session_id") ?? event.session_id,
		visitorId: strProp(event, "visitor_id"),
		timestamp: new Date(event.timestamp).toISOString(),
		properties: event.properties ?? {},
		userAgent: event.user_agent,
		ipHash: event.ip_hash,
	};
}

/** Parse a range token to a window in ms; `null` means "all time" (no window). */
export function parseRangeMs(range: string | undefined): number | null {
	if (range === undefined || range === "") return 7 * 24 * 60 * 60 * 1000;
	if (range === "all") return null;
	const match = /^(\d+)([hd])$/.exec(range);
	if (match === null) return 7 * 24 * 60 * 60 * 1000; // unknown → 7d default
	const value = Number(match[1]);
	const unit = match[2] === "h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
	return value * unit;
}

/** UTC `YYYY-MM-DD` for a ms timestamp. */
function dayKey(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Aggregate published `page_view` events into page-level statistics. Only
 * `published_site` `page_view`s that aren't previews are counted; `slug` /
 * `pageId` / `range` narrow the set further.
 */
export function aggregatePageStats(
	events: readonly StoredAnalyticsEvent[],
	query: StatsQuery,
): PublishedPageStats {
	const range = query.range ?? "7d";
	const windowMs = parseRangeMs(query.range);
	const since =
		windowMs === null ? Number.NEGATIVE_INFINITY : query.now - windowMs;

	const matched = events.filter((event) => {
		if (event.event_name !== "page_view") return false;
		if (event.source !== "published_site") return false;
		if (event.properties?.preview === true) return false; // never count previews
		if (event.timestamp < since) return false;
		if (query.slug !== undefined && strProp(event, "slug") !== query.slug) {
			return false;
		}
		if (query.pageId !== undefined && event.page_id !== query.pageId) {
			return false;
		}
		return true;
	});

	const visitors = new Set<string>();
	const sessions = new Set<string>();
	const referrers = new Map<string, number>();
	const byDay = new Map<string, number>();

	for (const event of matched) {
		const visitorId = strProp(event, "visitor_id");
		if (visitorId) visitors.add(visitorId);
		// Prefer the persistent client session id (30-min window) over the
		// adapter's per-page-load envelope id, falling back to the latter.
		const sessionId = strProp(event, "session_id") ?? event.session_id;
		if (sessionId) sessions.add(sessionId);

		const referrer = strProp(event, "referrer");
		const key = referrer && referrer.length > 0 ? referrer : DIRECT_REFERRER;
		referrers.set(key, (referrers.get(key) ?? 0) + 1);

		const day = dayKey(event.timestamp);
		byDay.set(day, (byDay.get(day) ?? 0) + 1);
	}

	const topReferrers = [...referrers.entries()]
		.map(([referrer, count]) => ({ referrer, count }))
		.sort((a, b) => b.count - a.count || a.referrer.localeCompare(b.referrer))
		.slice(0, TOP_REFERRERS_LIMIT);

	const viewsByDay = [...byDay.entries()]
		.map(([date, views]) => ({ date, views }))
		.sort((a, b) => a.date.localeCompare(b.date));

	return {
		...(query.pageId !== undefined ? { pageId: query.pageId } : {}),
		...(query.slug !== undefined ? { slug: query.slug } : {}),
		range,
		views: matched.length,
		uniqueVisitors: visitors.size,
		sessions: sessions.size,
		topReferrers,
		viewsByDay,
	};
}
