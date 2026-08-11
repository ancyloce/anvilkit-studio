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
 *
 * `p3-009`: the document's set is `root.props.designSystem.breakpoints`
 * (§4.1), read through `documentBreakpoints` by the caller — the
 * sidecar's `authoring.breakpoints` is gone. The precedence rule is
 * unchanged, and the empty case is still what hands the host its say.
 */
export function effectiveBreakpoints(
	documentBreakpointSet: readonly BreakpointDefinition[],
	editor: StudioEditorConfig,
): readonly BreakpointDefinition[] {
	if (documentBreakpointSet.length > 0) {
		return documentBreakpointSet;
	}
	return editor.breakpoints ?? DEFAULT_BREAKPOINT_PRESET;
}
