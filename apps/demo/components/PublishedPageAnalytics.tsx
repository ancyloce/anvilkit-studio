"use client";

import { createHttpAdapter } from "@anvilkit/analytics-core";
import { useEffect, useMemo, useRef } from "react";
import { getVisitorAndSession } from "@/lib/analytics/visitor-session";

/**
 * Client-side `page_view` tracker for the demo's published render path
 * (`/puck/render`). Mounted by a Server Component, so all browser-only work
 * (the adapter, `window`/`document`, `localStorage`) stays inside this
 * `"use client"` island.
 *
 * Fires exactly ONE `page_view` per `(slug, pageId)` after load, carrying only
 * PRIVACY-SAFE PRIMITIVE props — `page_id` / `slug` / `path` / `referrer` /
 * `title` / `preview` plus an anonymous `visitor_id` + `session_id`. It NEVER
 * sends the page document, root props, HTML, or DOM. Real HTTP analytics: posts
 * to `/api/analytics/events` with `source: "published_site"`.
 *
 * PREVIEW POLICY: preview/draft renders are SKIPPED entirely (no event emitted)
 * so the analytics reflect real published traffic only. The stats endpoint also
 * excludes any `preview: true` event as defence in depth.
 */
export interface PublishedPageAnalyticsProps {
	/** Stored page id, when the document came from the durable store. */
	readonly pageId?: string;
	/** Canonical slug being rendered (empty string for the showcase fallback). */
	readonly slug: string;
	/** Whether this is a preview (draft) render — skipped when true. */
	readonly preview: boolean;
}

export function PublishedPageAnalytics({
	pageId,
	slug,
	preview,
}: PublishedPageAnalyticsProps): null {
	// Stable adapter — created once. Re-creating it per render would re-arm its
	// visibilitychange listener and risk duplicate page views. Consent is on for
	// the demo; production would gate this behind a real consent signal.
	const adapter = useMemo(
		() =>
			createHttpAdapter({
				endpoint: "/api/analytics/events",
				source: "published_site",
				privacy: {
					consentGranted: true,
					truncateIpAddress: true,
					retentionDays: 90,
				},
			}),
		[],
	);

	// Dedupe React StrictMode's double-mount effect and a repeated (slug, pageId).
	const firedFor = useRef<string | null>(null);

	useEffect(() => {
		// Skip preview/draft renders — published analytics is real traffic only.
		if (preview) return;

		const key = `${pageId ?? ""}::${slug}`;
		if (firedFor.current === key) return;
		firedFor.current = key;

		const { visitorId, sessionId } = getVisitorAndSession();
		// Primitive props only — never the document, root props, HTML, or DOM.
		adapter.track("page_view", {
			...(pageId !== undefined ? { page_id: pageId } : {}),
			slug,
			path: window.location.pathname,
			referrer: document.referrer,
			title: document.title,
			preview: false,
			visitor_id: visitorId,
			session_id: sessionId,
		});
	}, [adapter, pageId, slug, preview]);

	return null;
}
