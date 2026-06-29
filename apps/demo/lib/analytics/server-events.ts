/**
 * @file Server-side analytics events (PRD 0004 — server-side publish fallback).
 *
 * The editor emits the *behavioral* `page_published` from the browser. This
 * module records the *factual* server-side counterpart after a publish write
 * succeeds, tagged `server_side: true` so the two are distinguishable in the
 * same store. It is a fallback/audit signal — it does not replace the client
 * event. Never receives or stores the full page document: only the primitive
 * slug + page id.
 */

import { ANALYTICS_EVENTS, EVENT_VERSION } from "@anvilkit/analytics-core";
import { recordAnalyticsEvents } from "./store";
import type { TrackEvent } from "./types";

/** Per-process session id for server-emitted events. */
function serverSessionId(): string {
	if (typeof globalThis.crypto?.randomUUID === "function") {
		return `server-${globalThis.crypto.randomUUID()}`;
	}
	return `server-${Date.now().toString(36)}`;
}

export interface ServerPagePublishedInput {
	/** Canonical slug of the published page. */
	readonly slug: string;
	/** Storage record id, when available (becomes `page_id`). */
	readonly pageId?: string;
	/** Server timestamp (ms). Injected so callers stay deterministic in tests. */
	readonly at: number;
}

/**
 * Build + record the server-side `page_published` audit event. Returns the
 * built envelope (handy for tests / callers that want to log it). Properties
 * are primitive-only and carry `server_side: true` to distinguish this from the
 * client-side behavioral event.
 */
export function recordServerPagePublished(
	input: ServerPagePublishedInput,
): TrackEvent {
	const event: TrackEvent = {
		event_name: ANALYTICS_EVENTS.PAGE_PUBLISHED,
		version: EVENT_VERSION,
		timestamp: input.at,
		session_id: serverSessionId(),
		source: "studio",
		...(input.pageId !== undefined ? { page_id: input.pageId } : {}),
		properties: {
			status_change: "published",
			server_side: true,
			slug: input.slug,
		},
	};
	recordAnalyticsEvents([event], input.at);
	console.log("[analytics:server] page_published", {
		slug: input.slug,
		page_id: input.pageId,
		server_side: true,
	});
	return event;
}
