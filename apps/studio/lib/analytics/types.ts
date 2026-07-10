/**
 * @file Types for the demo's analytics ingestion endpoint (`POST
 * /api/analytics/events`). Type-only imports keep this module React- and
 * Next-free so the validation/handler unit-test under the node preset.
 *
 * The wire shape mirrors what `createHttpAdapter` (`@anvilkit/analytics-core`)
 * POSTs: a batch of {@link TrackEvent} envelopes plus a small privacy `meta`.
 */

import type { TrackEvent } from "@anvilkit/analytics-core";

export type { TrackEvent };

/** Privacy metadata the transport rides along on every batch. */
export interface AnalyticsIngestMeta {
	source?: "studio" | "published_site";
	truncate_ip?: boolean;
	retention_days?: number;
}

/** The `POST /api/analytics/events` request body. */
export interface AnalyticsIngestBody {
	events: TrackEvent[];
	meta?: AnalyticsIngestMeta;
}

/**
 * Server-derived enrichment attached at ingestion — NEVER sent by the client.
 * Both fields are privacy-safe: the user-agent is a coarse client hint and the
 * IP is stored ONLY as a salted hash (the raw address never touches the store).
 */
export interface ServerEnrichment {
	/** Raw `User-Agent` request header (or `undefined` when absent). */
	user_agent?: string;
	/** Salted SHA-256 hash of the client IP — uniqueness signal, not the IP. */
	ip_hash?: string;
}

/** A persisted event — the validated envelope, server receive time + enrichment. */
export interface StoredAnalyticsEvent extends TrackEvent, ServerEnrichment {
	/** Server receive time (ms since epoch). */
	received_at: number;
}

/**
 * The logical published-analytics record (camelCase) the task contract names.
 * It is a *view* over {@link StoredAnalyticsEvent}: identity (`session_id`) and
 * server enrichment live on the envelope; `visitorId` / `slug` / `path` /
 * `referrer` ride in the primitive `properties`. {@link toPublishedRecord}
 * builds it. Kept separate so the persisted envelope stays the privacy-safe
 * source of truth and this stays a derived, never-stored projection.
 */
export interface PublishedAnalyticsEventRecord {
	id: string;
	eventName: "page_view" | string;
	source: "published_site" | "studio";
	pageId?: string;
	slug?: string;
	path?: string;
	referrer?: string;
	sessionId: string;
	visitorId?: string;
	timestamp: string;
	properties: Record<string, string | number | boolean>;
	userAgent?: string;
	ipHash?: string;
}

/** Response envelope returned by the ingestion endpoint. */
export type AnalyticsIngestResponse =
	| { ok: true; accepted: number }
	| { ok: false; message: string; issues?: unknown[] };
