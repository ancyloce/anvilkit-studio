/**
 * @file The runtime-owned analytics port (restructure plan 0001, Phase 4).
 *
 * `@anvilkit/core` is a runtime-layer package: it must not depend on the
 * analytics capability (`@anvilkit/analytics-core`). This port declares the
 * minimal surface core's telemetry seams actually consume — `track` only —
 * and every `@anvilkit/analytics-core` adapter satisfies it structurally
 * (guarded by the compat test in `react/components/analytics-events.test.ts`,
 * where the capability remains a devDependency).
 */

/**
 * The Studio-owned system events `<Studio>` emits through the port. Each
 * name must remain a member of the analytics capability's event catalog
 * (`AnalyticsEventName`); the compat test enforces membership.
 */
export type StudioAnalyticsEventName =
	| "draft_saved"
	| "page_published"
	| "component_dropped"
	| "seo_updated"
	| "plugin_toggled";

/**
 * The minimal analytics surface consumed by `<Studio analytics>`. Any
 * `@anvilkit/analytics-core` adapter (Noop/Console/LocalStorage/Http/GA4/
 * PostHog) is assignable to it.
 */
export interface StudioAnalyticsPort {
	track(eventName: string, properties: Record<string, unknown>): void;
}
