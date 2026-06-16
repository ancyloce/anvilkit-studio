"use client";

import { createConsoleAdapter } from "@anvilkit/analytics-core";
import { AnalyticsProvider, useTrack } from "@anvilkit/analytics-react";
import { usePathname } from "next/navigation";
import {
	type ReactElement,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
} from "react";

/**
 * F15: fire exactly one `page_view` per published-site route change, with
 * lightweight props only (url / referrer / viewport_width). The ref guard
 * dedupes React StrictMode's double-effect and a repeated pathname; emission
 * is a no-op without consent (the adapter gates `track`).
 */
function PageViewTracker(): null {
	const track = useTrack();
	const pathname = usePathname();
	const lastFired = useRef<string | null>(null);

	useEffect(() => {
		if (lastFired.current === pathname) return;
		lastFired.current = pathname;
		track("page_view", {
			url: typeof window === "undefined" ? pathname : window.location.href,
			referrer: typeof document === "undefined" ? "" : document.referrer,
			viewport_width: typeof window === "undefined" ? 0 : window.innerWidth,
		});
	}, [pathname, track]);

	return null;
}

/**
 * Published-site analytics root (PRD 0004 F15). Mounts `AnalyticsProvider`
 * around the rendered page and tracks page views on App-Router navigation. The
 * console adapter logs events here; production swaps in an Http/GA4/PostHog
 * adapter.
 */
export default function PublishedSiteLayout({
	children,
}: {
	readonly children: ReactNode;
}): ReactElement {
	const adapter = useMemo(
		() => createConsoleAdapter({ source: "published_site" }),
		[],
	);

	return (
		<AnalyticsProvider adapter={adapter} context={{ source: "published_site" }}>
			<PageViewTracker />
			{children}
		</AnalyticsProvider>
	);
}
