import { ingestAnalyticsEvents } from "@/lib/analytics/analytics-api";
import { deriveServerEnrichment } from "@/lib/analytics/request-context";

export const runtime = "nodejs";

/**
 * `POST /api/analytics/events` — the demo's analytics ingestion endpoint.
 *
 * Accepts the batch shape `createHttpAdapter` POSTs:
 *   `{ events: TrackEvent[], meta?: { source?, truncate_ip?, retention_days? } }`
 *
 * The handler is the trust boundary: it re-validates every event (allowed
 * names, known sources, primitive-only properties, forbidden-field deny-list)
 * before persisting. A malformed batch is rejected as a whole with `400` and
 * structured `issues`; a valid batch returns `{ ok: true, accepted }`.
 *
 * Server enrichment (coarse user-agent + a salted IP HASH — never the raw IP)
 * is derived here from the request headers and attached at persistence time, so
 * the privacy-sensitive derivation stays on the server, off the client wire.
 */
export async function POST(req: Request): Promise<Response> {
	const body = await req.json().catch(() => ({}));
	const { status, body: responseBody } = ingestAnalyticsEvents(
		body,
		Date.now(),
		deriveServerEnrichment(req),
	);
	return Response.json(responseBody, { status });
}
