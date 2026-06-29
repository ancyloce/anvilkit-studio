import { aggregatePageStats } from "@/lib/analytics/stats";
import { getRecordedAnalyticsEvents } from "@/lib/analytics/store";

export const runtime = "nodejs";
// Stats reflect the live event store, which mutates per request — never cache.
export const dynamic = "force-dynamic";

/**
 * `GET /api/analytics/stats` — published-page analytics statistics.
 *
 * Query params:
 *   - `slug`   — narrow to one published slug (e.g. `?slug=about`)
 *   - `pageId` — narrow to one stored page id
 *   - `range`  — time window token: `24h`, `7d` (default), `30d`, `90d`, `all`
 *
 * Aggregates only non-preview `page_view` events with `source:"published_site"`
 * (editor + preview traffic never count). Returns:
 *   `{ ok: true, data: { views, uniqueVisitors, sessions, topReferrers, viewsByDay, … } }`
 */
export async function GET(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const slug = url.searchParams.get("slug") ?? undefined;
	const pageId = url.searchParams.get("pageId") ?? undefined;
	const range = url.searchParams.get("range") ?? undefined;

	const data = aggregatePageStats(getRecordedAnalyticsEvents(), {
		slug,
		pageId,
		range,
		now: Date.now(),
	});

	return Response.json({ ok: true, data });
}
