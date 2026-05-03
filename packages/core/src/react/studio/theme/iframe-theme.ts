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
	--ak-studio-bg: var(--background);
	--ak-studio-fg: var(--foreground);
	--ak-studio-panel: var(--card);
	--ak-studio-panel-fg: var(--card-foreground);
	--ak-studio-border: var(--border);
	--ak-studio-muted: var(--muted);
	--ak-studio-muted-fg: var(--muted-foreground);
	--ak-studio-accent: var(--accent);
	--ak-studio-accent-fg: var(--accent-foreground);
	--ak-studio-ring: var(--ring);
	color: var(--ak-studio-fg);
	background-color: var(--ak-studio-bg);
}`;

export const IFRAME_THEME_CSS = TOKEN_BLOCK;
