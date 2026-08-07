"use client";

/**
 * @file The default breakpoint preset (PLAN-0020 CORE-P1A-008;
 * DD-0019 §12.1; OQ-002 default — flagged for product sign-off).
 *
 * Desktop-first: base plus max-width 991 / 767 / 479, host-overridable
 * via `StudioEditorConfig.breakpoints`. The preset is **effective
 * state only** — it never writes itself into the sidecar; the first
 * committed breakpoint-layer write materializes the effective set via
 * a `breakpoints.set` member batched into the same intent
 * (`withBreakpointMaterialization`), so switching breakpoints alone
 * never enters history.
 */

import type {
	BreakpointDefinition,
	StudioEditorConfig,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
} from "../../../editor/legacy/index.js";

/** OQ-002 default preset: base + 991 / 767 / 479. */
export const DEFAULT_BREAKPOINT_PRESET: readonly BreakpointDefinition[] = [
	{ id: "tablet", label: "Tablet", maxWidth: 991, order: 0, enabled: true },
	{ id: "mobile", label: "Mobile", maxWidth: 767, order: 1, enabled: true },
	{
		id: "mobile-small",
		label: "Small",
		maxWidth: 479,
		order: 2,
		enabled: true,
	},
];

/**
 * The breakpoints the editor operates on: the document's own set once
 * any exists, else the host-configured set, else the default preset.
 */
export function effectiveBreakpoints(
	authoring: AuthoringStateV1,
	editor: StudioEditorConfig,
): readonly BreakpointDefinition[] {
	if (authoring.breakpoints.length > 0) {
		return authoring.breakpoints;
	}
	return editor.breakpoints ?? DEFAULT_BREAKPOINT_PRESET;
}
