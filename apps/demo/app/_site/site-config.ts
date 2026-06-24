/**
 * Shared configuration for the demo's marketing chrome (global nav, footer,
 * and the Home / Editor / About pages).
 *
 * The visual language follows `DESIGN.md` (the "Huly" reference): a near-black
 * aurora hero, alternating dark/light bands, the Electric-Iris / Ember-Pulse
 * accent pair, and pill geometry. Tokens live in `huly.css`; this module owns
 * the route map and external links.
 */

/**
 * The published docs site is a separate Astro app (`apps/docs`,
 * `site: https://anvilkit.dev`, dev server on :4321). It cannot be reached by
 * Next routing, so the "Docs" nav item links to its URL. Point this at the
 * local docs dev server (`pnpm docs:dev` → http://localhost:4321) while
 * developing; the production default is the deployed site.
 */
export const DOCS_URL =
	process.env.NEXT_PUBLIC_DOCS_URL ?? "https://anvilkit.dev";

/** Source repository — shown as the "GitHub" link in the nav and footer. */
export const GITHUB_URL = "https://github.com/ancyloce/anvilkit-studio";

export interface SiteNavLink {
	readonly label: string;
	/** Internal Next route, or an absolute URL when {@link external} is true. */
	readonly href: string;
	/** External links open in a new tab (e.g. the standalone docs site). */
	readonly external?: boolean;
}

/** The four global nav items requested in the brief: Home | Editor | Docs | About. */
export const NAV_LINKS: readonly SiteNavLink[] = [
	{ label: "Home", href: "/" },
	{ label: "Editor", href: "/editor" },
	{ label: "Docs", href: DOCS_URL, external: true },
	{ label: "About", href: "/about" },
];

/**
 * Routes that render the marketing chrome (global nav + footer). Every other
 * route is an "immersive" surface — the Puck editor, canvas studio, collab,
 * and the minimal `<Studio>` scratch pages — which keep their own full-bleed
 * layout with only the surface itself: no marketing nav and no floating theme
 * toggle.
 */
const MARKETING_ROUTES: readonly string[] = ["/", "/editor", "/about"];

/** True when the marketing nav + footer should wrap the given pathname. */
export function isMarketingRoute(pathname: string | null): boolean {
	if (!pathname) return false;
	return MARKETING_ROUTES.includes(pathname);
}

/** Active-state match for a nav item against the current pathname. */
export function isNavLinkActive(link: SiteNavLink, pathname: string): boolean {
	if (link.external) return false;
	if (link.href === "/") return pathname === "/";
	return pathname === link.href || pathname.startsWith(`${link.href}/`);
}
