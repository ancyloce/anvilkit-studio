/**
 * @file Full-width viewport append for AnvilKit chrome (PRD §6.1).
 *
 * The AnvilKit chrome's canvas fills the available space by default,
 * so a `"full"` viewport is appended after the responsive presets.
 * Selecting it sets the Puck `current.width` to `"100%"` so the
 * canvas frame stretches to the surrounding container.
 */

import type { StudioViewport } from "./viewports";
import { DEFAULT_VIEWPORTS } from "./viewports";

export const FULL_WIDTH_VIEWPORT: StudioViewport = {
	label: "full",
	width: "100%",
	height: "auto",
	icon: "Monitor",
};

export const FULL_WIDTH_VIEWPORTS: readonly StudioViewport[] = [
	...DEFAULT_VIEWPORTS,
	FULL_WIDTH_VIEWPORT,
];
