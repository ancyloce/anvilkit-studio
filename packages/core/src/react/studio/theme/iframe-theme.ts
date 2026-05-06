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

/*
 * Selection chrome for the `ComponentOverlay` override. Lives here
 * (in the iframe-injected snapshot) as well as in `overrides/styles.css`
 * (host-document) so the ring paints in both documents — Puck's canvas
 * iframe does not inherit host-document utility classes.
 *
 * Also suppresses Puck's built-in azure outline on the inner
 * `_DraggableComponent-overlay_` element so we don't get a double ring.
 */
const IFRAME_SELECTION_BLOCK = `[class*="_DraggableComponent-overlay_"] {
	outline: 0 !important;
	background: transparent !important;
}

[data-ak-overlay] {
	outline-style: solid;
	outline-offset: -1px;
	outline-width: 0;
	outline-color: transparent;
}

[data-ak-overlay][data-overlay-state="hover"] {
	outline-width: 1px;
	outline-color: color-mix(in oklab, var(--ak-studio-accent) 30%, transparent);
}

[data-ak-overlay][data-overlay-state="selected"] {
	outline-width: 2px;
	outline-color: var(--ak-studio-accent);
}

[data-ak-overlay-label] {
	pointer-events: none;
	position: absolute;
	bottom: 100%;
	left: 0;
	z-index: 10;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px 8px;
	border-top-left-radius: 6px;
	border-top-right-radius: 6px;
	font-size: 11px;
	font-weight: 500;
	line-height: 1;
	background-color: color-mix(in oklab, var(--ak-studio-accent) 18%, var(--ak-studio-bg));
	color: var(--ak-studio-accent);
}

.dark [data-ak-overlay-label] {
	background-color: var(--ak-studio-accent);
	color: var(--ak-studio-accent-fg);
}`;

export const IFRAME_THEME_CSS = `${TOKEN_BLOCK}\n${IFRAME_RESET_BLOCK}\n${IFRAME_SELECTION_BLOCK}`;
