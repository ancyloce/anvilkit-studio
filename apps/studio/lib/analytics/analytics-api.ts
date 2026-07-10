/**
 * @file Pure, framework-agnostic analytics ingestion handler — mirrors the
 * Page API (`page-api.ts`) shape: takes the parsed body (+ a server timestamp)
 * and returns an HTTP status plus a consistent response envelope, so the Next
 * route file stays trivial and this handler unit-tests under the node preset.
 *
 * Persistence is intentionally minimal (an in-memory {@link recordAnalyticsEvents}
 * sink + a structured server log line per event). The structured log is the
 * "replace me with a real backend" seam: a warehouse/Kafka writer drops in here
 * without touching validation or the route.
 */

import { recordAnalyticsEvents } from "./store";
import type { AnalyticsIngestResponse, ServerEnrichment } from "./types";
import { validateAnalyticsIngest } from "./validation";

export interface AnalyticsIngestResult {
	readonly status: number;
	readonly body: AnalyticsIngestResponse;
}

/**
 * Validate + persist a batch of analytics events. `receivedAt` is injected
 * (not read from `Date.now()` here) so the handler stays pure and
 * deterministically testable. `enrichment` carries server-derived, privacy-safe
 * fields (coarse user-agent + a salted IP HASH — never the raw IP) extracted by
 * the route from the request; it is optional so callers/tests can omit it.
 */
export function ingestAnalyticsEvents(
	body: unknown,
	receivedAt: number,
	enrichment: ServerEnrichment = {},
): AnalyticsIngestResult {
	const result = validateAnalyticsIngest(body);
	if (!result.ok) {
		return {
			status: 400,
			body: { ok: false, message: result.message, issues: result.issues },
		};
	}

	recordAnalyticsEvents(result.events, receivedAt, enrichment);

	// Structured server-side log — the placeholder for a real analytics sink.
	// Only primitive envelope fields are logged (never the properties tree as a
	// blob), keeping the privacy boundary intact end-to-end.
	for (const event of result.events) {
		console.log("[analytics:ingest]", {
			event_name: event.event_name,
			source: event.source,
			session_id: event.session_id,
			page_id: event.page_id,
			workspace_id: event.workspace_id,
			user_id: event.user_id,
			received_at: receivedAt,
		});
	}

	return { status: 200, body: { ok: true, accepted: result.events.length } };
}
