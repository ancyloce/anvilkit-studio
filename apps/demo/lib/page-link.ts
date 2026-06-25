/**
 * @file Page-link mapping between a configured page path and its rendered route.
 *
 * Components (e.g. `@anvilkit/button`) store a plain `href`/path like `/about`.
 * The demo serves published pages under `/puck/render/<slug>` (see
 * `app/puck/render/[...slug]/page.tsx`). This module is the single source of
 * truth for that mapping so the client navigation interceptor
 * (`RenderNavigation`) and any editor-side link tooling agree on where a slug
 * resolves — no per-component "router-aware" forks required.
 */

/** Base path under which the demo renders published pages. */
export const RENDER_BASE = "/puck/render";

/**
 * `true` for a same-origin app path (`/about`, `/team/members`). Returns `false`
 * for external URLs (`https://…`, `mailto:…`), protocol-relative URLs (`//host`),
 * and in-page fragments (`#section`) — those keep their native behavior.
 */
export function isInternalPath(href: string): boolean {
	return href.startsWith("/") && !href.startsWith("//");
}

/**
 * Map an internal path to its `/puck/render/<slug>` route.
 *
 * - `/about` → `/puck/render/about`
 * - `/team/members?tab=1#top` → `/puck/render/team/members?tab=1#top` (query/hash preserved)
 * - `/` → `/puck/render`
 * - Idempotent: a path already under `/puck/render` is returned unchanged.
 */
export function toRenderHref(path: string): string {
	if (path === RENDER_BASE || path.startsWith(`${RENDER_BASE}/`)) return path;
	const suffixStart = path.search(/[?#]/);
	const pathname = suffixStart === -1 ? path : path.slice(0, suffixStart);
	const suffix = suffixStart === -1 ? "" : path.slice(suffixStart);
	const slug = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
	const base = slug.length === 0 ? RENDER_BASE : `${RENDER_BASE}/${slug}`;
	return `${base}${suffix}`;
}
