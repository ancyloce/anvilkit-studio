"use client";

import { usePathname } from "next/navigation";
import { SiteNav } from "./SiteNav";
import { isMarketingRoute } from "./site-config";

/**
 * Renders the global marketing nav on content routes (Home / Editor / About
 * and the component playgrounds). On immersive editor surfaces it renders
 * nothing, so those pages stay full-bleed with only the editor itself
 * visible — no floating theme toggle.
 */
export function SiteChrome() {
	const pathname = usePathname();

	if (isMarketingRoute(pathname)) {
		return <SiteNav />;
	}

	return null;
}
