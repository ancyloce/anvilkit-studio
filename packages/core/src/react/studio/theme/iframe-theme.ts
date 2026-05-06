/**
 * @file CSS snapshot injected into the Puck iframe for theme sync.
 *
 * The Puck render iframe is a separate `Document`, so the host's
 * `<html>.dark` class and `--ak-studio-*` vars do not propagate
 * automatically. `ThemeSync` mounts a `<style>` tag inside the
 * iframe with the bridged tokens (PRD §3.4) so iframe content
 * picks up the same theme as the surrounding chrome.
 *
 * Kept as a plain string (rather than computed at runtime) because
 * the contract is defined per PRD §7.2 and changes require a
 * deliberate edit, not a CSS-var read at mount time.
 */

export const IFRAME_THEME_STYLE_ID = "anvilkit-studio-iframe-theme";

const TOKEN_BLOCK = `:root,
:host {
	--ak-studio-blue-600: var(--color-blue-600, oklch(54.6% 0.245 262.881));
	--ak-studio-theme: var(--ak-studio-blue-600);
	--ak-studio-theme-fg: oklch(1 0 0);
	--ak-studio-bg: var(--background);
	--ak-studio-fg: var(--foreground);
	--ak-studio-panel: var(--card);
	--ak-studio-panel-fg: var(--card-foreground);
	--ak-studio-border: var(--border);
	--ak-studio-muted: var(--muted);
	--ak-studio-muted-fg: var(--muted-foreground);
	--ak-studio-accent: var(--ak-studio-theme);
	--ak-studio-accent-fg: var(--ak-studio-theme-fg);
	--ak-studio-ring: var(--ak-studio-theme);
	--ak-studio-layer-icon: var(--ak-studio-theme);
	--ak-studio-layer-selection: var(--ak-studio-theme);
	--ak-studio-layer-selection-fg: var(--ak-studio-theme-fg);
	--ak-studio-rail-width: 44px;
	--ak-studio-panel-width: 280px;
	--accent: var(--ak-studio-theme);
	--accent-foreground: var(--ak-studio-theme-fg);
	--primary: var(--ak-studio-theme);
	--primary-foreground: var(--ak-studio-theme-fg);
	--ring: var(--ak-studio-theme);
	color: var(--ak-studio-fg);
	background-color: var(--ak-studio-bg);
}`;

/*
 * Neutralize host page-level rules that Puck's CopyHostStyles pulls
 * into the iframe. Hosts often set `html, body { overflow-x: hidden;
 * max-width: 100vw }` for the outer page; per CSS spec, pairing a
 * non-visible overflow on one axis with `visible` on the other
 * promotes the unspecified axis to `auto`, turning both <html> and
 * <body> into scroll containers — that's the two stacked vertical
 * scrollbars at the canvas's right edge. `!important` is required
 * because the host stylesheet wins on cascade order otherwise.
 */
const IFRAME_RESET_BLOCK = `html,
body {
	overflow: visible !important;
	max-width: none !important;
}`;

export const IFRAME_THEME_CSS = `${TOKEN_BLOCK}\n${IFRAME_RESET_BLOCK}`;
