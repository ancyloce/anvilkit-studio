"use client";

import { createHttpAdapter } from "@anvilkit/analytics-core";
import { AnalyticsProvider, useTrack } from "@anvilkit/analytics-react";
import { usePathname } from "next/navigation";
import {
	type ReactElement,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
} from "react";
import { getVisitorAndSession } from "@/lib/analytics/visitor-session";

/**
 * F15: fire exactly one `page_view` per published-site route change, with
 * PRIMITIVE props only — `slug` / `path` / `url` / `referrer` / `title` plus an
 * anonymous `visitor_id` + `session_id` for the stats endpoint's unique-visitor
 * / session metrics. The slug is derived from the pathname (the canonical
 * published key). The ref guard dedupes React StrictMode's double-effect and a
 * repeated pathname; emission is a no-op without consent (the adapter gates
 * `track`). This is the public-site counterpart to `<PublishedPageAnalytics>`.
 */
function PageViewTracker(): null {
	const track = useTrack();
	const pathname = usePathname();
	const lastFired = useRef<string | null>(null);

	useEffect(() => {
		if (lastFired.current === pathname) return;
		lastFired.current = pathname;
		const { visitorId, sessionId } = getVisitorAndSession();
		track("page_view", {
			slug: pathname.replace(/^\//, ""),
			path: pathname,
			url: typeof window === "undefined" ? pathname : window.location.href,
			referrer: typeof document === "undefined" ? "" : document.referrer,
			title: typeof document === "undefined" ? "" : document.title,
			preview: false,
			visitor_id: visitorId,
			session_id: sessionId,
		});
	}, [pathname, track]);

	return null;
}

/**
 * Published-site analytics root (PRD 0004 F15). Mounts `AnalyticsProvider`
 * around the rendered page and tracks page views on App-Router navigation. Sends
 * REAL HTTP analytics by default — the `page_view` events POST to
 * `/api/analytics/events` with `source: "published_site"` (production would swap
 * in a GA4/PostHog adapter via the same provider seam).
 */
export default function PublishedSiteLayout({
	children,
}: {
	readonly children: ReactNode;
}): ReactElement {
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

	return (
		<AnalyticsProvider adapter={adapter} context={{ source: "published_site" }}>
			<PageViewTracker />
			{children}
		</AnalyticsProvider>
	);
}
