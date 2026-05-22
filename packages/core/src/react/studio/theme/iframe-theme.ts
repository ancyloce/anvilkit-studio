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
	--ak-ds-brand-50: oklch(97% 0.013 254);
	--ak-ds-brand-100: oklch(94% 0.029 254);
	--ak-ds-brand-200: oklch(88% 0.059 254);
	--ak-ds-brand-300: oklch(80% 0.099 254);
	--ak-ds-brand-400: oklch(70% 0.149 254);
	--ak-ds-brand-500: oklch(62% 0.197 254);
	--ak-ds-brand-600: oklch(54.6% 0.245 262.881);
	--ak-ds-brand-700: oklch(48% 0.218 263);
	--ak-ds-brand-800: oklch(40% 0.176 263);
	--ak-ds-brand-900: oklch(32% 0.13 263);
	--ak-ds-neutral-50: oklch(98.5% 0 0);
	--ak-ds-neutral-100: oklch(96% 0 0);
	--ak-ds-neutral-200: oklch(92% 0 0);
	--ak-ds-neutral-300: oklch(86% 0 0);
	--ak-ds-neutral-400: oklch(70% 0 0);
	--ak-ds-neutral-500: oklch(58% 0 0);
	--ak-ds-neutral-600: oklch(46% 0 0);
	--ak-ds-neutral-700: oklch(35% 0 0);
	--ak-ds-neutral-800: oklch(22% 0 0);
	--ak-ds-neutral-900: oklch(14% 0 0);
	--ak-ds-space-0: 0;
	--ak-ds-space-1: 4px;
	--ak-ds-space-2: 8px;
	--ak-ds-space-3: 12px;
	--ak-ds-space-4: 16px;
	--ak-ds-space-6: 24px;
	--ak-ds-space-8: 32px;
	--ak-ds-space-12: 48px;
	--ak-ds-space-16: 64px;
	--ak-ds-space-24: 96px;
	--ak-ds-text-xs: 12px;
	--ak-ds-text-sm: 14px;
	--ak-ds-text-base: 16px;
	--ak-ds-text-lg: 18px;
	--ak-ds-text-xl: 20px;
	--ak-ds-text-2xl: 24px;
	--ak-ds-text-3xl: 30px;
	--ak-ds-radius-sm: 4px;
	--ak-ds-radius-md: 8px;
	--ak-ds-radius-lg: 12px;
	--ak-ds-bg: var(--ak-ds-neutral-50, var(--ak-studio-bg));
	--ak-ds-surface: var(--ak-ds-neutral-100, var(--ak-studio-panel));
	--ak-ds-fg: var(--ak-ds-neutral-900, var(--ak-studio-fg));
	--ak-ds-fg-muted: var(--ak-ds-neutral-600, var(--ak-studio-muted-fg));
	--ak-ds-accent: var(--ak-ds-brand-500, var(--ak-studio-accent));
	--ak-ds-accent-fg: var(--ak-ds-neutral-50, var(--ak-studio-accent-fg));
	--ak-ds-border: var(--ak-ds-neutral-200, var(--ak-studio-border));
	--ak-ds-focus-ring: var(--ak-ds-brand-500, var(--ak-studio-ring));
	--accent: var(--ak-studio-theme);
	--accent-foreground: var(--ak-studio-theme-fg);
	--primary: var(--ak-studio-theme);
	--primary-foreground: var(--ak-studio-theme-fg);
	--ring: var(--ak-studio-theme);
	color: var(--ak-studio-fg);
	background-color: var(--ak-studio-bg);
}

.dark {
	--ak-ds-neutral-50: oklch(14% 0 0);
	--ak-ds-neutral-100: oklch(22% 0 0);
	--ak-ds-neutral-200: oklch(28% 0 0);
	--ak-ds-neutral-300: oklch(35% 0 0);
	--ak-ds-neutral-400: oklch(50% 0 0);
	--ak-ds-neutral-500: oklch(60% 0 0);
	--ak-ds-neutral-600: oklch(70% 0 0);
	--ak-ds-neutral-700: oklch(80% 0 0);
	--ak-ds-neutral-800: oklch(92% 0 0);
	--ak-ds-neutral-900: oklch(98.5% 0 0);
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
 * (in the iframe-injected snapshot) as well as in `overrides/styles.src.css`
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
	outline-width: 0;
	outline-color: transparent;
	outline-offset: 0;
}

[data-ak-overlay][data-overlay-state="hover"] {
	outline-width: 1px;
	outline-offset: -1px;
	outline-color: color-mix(in oklab, var(--ak-studio-accent) 30%, transparent);
}

[data-ak-overlay][data-overlay-state="selected"] {
	outline-width: 2px;
	outline-offset: -2px;
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
	padding-top: 6px;
	border-top-left-radius: 6px;
	border-top-right-radius: 6px;
	font-size: 11px;
	font-weight: 500;
	line-height: 1;
	background-color: var(--ak-studio-accent);
	color: #fff;
}

.dark [data-ak-overlay-label] {
	background-color: var(--ak-studio-accent);
	color: var(--ak-studio-accent-fg);
}

[data-ak-overlay][data-label-position="inside"] [data-ak-overlay-label] {
	bottom: auto;
	top: 0;
	border-top-left-radius: 0;
	border-top-right-radius: 0;
	border-bottom-right-radius: 6px;
}

/*
 * Drop-target highlight for sidebar → canvas drag-and-drop
 * replacement (canvas-drop/useCanvasDropController). Painted on the
 * Puck component wrapper under the pointer while a compatible text or
 * image payload is being dragged. \`!important\` so it reads clearly
 * over arbitrary component styling.
 */
[data-ak-drop-target] {
	outline: 2px dashed var(--ak-studio-accent) !important;
	outline-offset: -2px !important;
	background-color: color-mix(in oklab, var(--ak-studio-accent) 10%, transparent) !important;
}`;

export const IFRAME_THEME_CSS = `${TOKEN_BLOCK}\n${IFRAME_RESET_BLOCK}\n${IFRAME_SELECTION_BLOCK}`;
