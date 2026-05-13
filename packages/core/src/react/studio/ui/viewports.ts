/**
 * @file Viewport presets for the Studio toolbar.
 *
 * Names match `Viewport.label` in `@puckeditor/core` so they round-
 * trip through Puck's `viewports.options` slot. The icon names are
 * `lucide-react` lookups resolved at render time by the toolbar.
 */

import type { Viewport } from "@puckeditor/core";

export type StudioViewportId = "mobile" | "tablet" | "desktop" | "full";

export type StudioViewport = Viewport & {
	readonly label: StudioViewportId | (string & {});
};

export const DEFAULT_VIEWPORTS: readonly StudioViewport[] = [
	{ label: "mobile", width: 360, height: "auto", icon: "Smartphone" },
	{ label: "tablet", width: 768, height: "auto", icon: "Tablet" },
	{ label: "desktop", width: 1280, height: "auto", icon: "Monitor" },
];

export function normalizeStudioViewports(
	viewports: readonly Viewport[],
): readonly StudioViewport[] {
	return viewports.map((viewport, index) => ({
		...viewport,
		label:
			viewport.label === undefined || viewport.label.length === 0
				? `viewport-${index + 1}`
				: viewport.label,
	}));
}
