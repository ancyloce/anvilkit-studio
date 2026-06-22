/**
 * @file Internal React context exposing the optional `<Studio analytics>`
 * adapter (PRD 0004 F9) to chrome components that emit system telemetry from
 * their own interaction seams.
 *
 * The controller owns the three data-lifecycle events (`draft_saved`,
 * `page_published`, `component_dropped`) and the SEO diff (`seo_updated`)
 * directly, because those all flow through its handlers. The
 * `plugin_toggled` event originates in the sidebar rail — a UI-interaction
 * seam mounted inside Puck's `puck` override slot, where no prop threading is
 * possible — so the rail reads the adapter through this context instead
 * (mirrors `chrome-props.tsx`).
 *
 * This context is intentionally NOT re-exported from the package barrel: it is
 * a private wiring seam, so the public API surface is unchanged. A missing
 * provider (legacy `chrome="puck"`) or no `analytics` prop yields `undefined`,
 * which makes every consumer a no-op.
 */

import type { AnalyticsAdapter } from "@anvilkit/analytics-core";
import { createContext, type ReactNode, use } from "react";

const StudioAnalyticsContext = createContext<AnalyticsAdapter | undefined>(
	undefined,
);

export interface StudioAnalyticsProviderProps {
	readonly adapter: AnalyticsAdapter | undefined;
	readonly children: ReactNode;
}

export function StudioAnalyticsProvider({
	adapter,
	children,
}: StudioAnalyticsProviderProps): ReactNode {
	return (
		<StudioAnalyticsContext value={adapter}>{children}</StudioAnalyticsContext>
	);
}

/** The active `<Studio analytics>` adapter, or `undefined` when unset. */
export function useStudioAnalytics(): AnalyticsAdapter | undefined {
	return use(StudioAnalyticsContext);
}
