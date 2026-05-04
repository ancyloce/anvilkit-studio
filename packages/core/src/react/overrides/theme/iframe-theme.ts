/**
 * @file Re-export of the iframe theme snapshot for the canvas
 * iframe override.
 *
 * The canonical CSS string lives at `studio/theme/iframe-theme.ts`
 * because `useThemeSync` (Phase 2) consumes it. This barrel keeps
 * the import path documented in the plan (`overrides/theme/...`)
 * working without duplicating the string.
 */

export {
	IFRAME_THEME_CSS,
	IFRAME_THEME_STYLE_ID,
} from "../../studio/theme/iframe-theme";
