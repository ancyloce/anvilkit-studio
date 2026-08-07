"use client";

/**
 * @file Breakpoint materialization (PLAN-0020 CORE-P1A-008).
 *
 * The default/host preset exists only as **effective** state until a
 * user actually writes at a breakpoint layer. Switching the write
 * target must never enter history (§12.3), so materialization rides
 * the first breakpoint-layer write: the write is wrapped in a batch
 * whose first member is `breakpoints.set(effective)` — one intent,
 * one history entry, and undo removes both together.
 */

import type {
	BreakpointDefinition,
	ResponsiveLayerRef,
} from "@anvilkit/contracts/editor";
import type {
	AtomicEditorCommand,
	EditorCommand,
} from "../../../editor/legacy/index.js";
import type {
	AuthoringStateV1,
} from "../../../editor/legacy/index.js";

/**
 * Wrap `command` so that writing at a not-yet-materialized breakpoint
 * layer first persists the effective breakpoint set, atomically.
 * Returns `command` unchanged for base-layer writes and documents
 * whose sidecar already owns its breakpoints.
 */
export function withBreakpointMaterialization(
	command: AtomicEditorCommand & { readonly breakpointId: ResponsiveLayerRef },
	authoring: AuthoringStateV1,
	effective: readonly BreakpointDefinition[],
): EditorCommand {
	if (
		command.breakpointId === "base" ||
		authoring.breakpoints.some(
			(breakpoint) => breakpoint.id === command.breakpointId,
		)
	) {
		return command;
	}
	if (!effective.some((breakpoint) => breakpoint.id === command.breakpointId)) {
		// Unknown layer: let validation reject it untouched.
		return command;
	}
	return {
		id: command.id,
		expectedRevision: command.expectedRevision,
		source: command.source,
		timestamp: command.timestamp,
		type: "batch",
		label: "materialize-breakpoints",
		commands: [
			{
				id: `${command.id}:breakpoints`,
				expectedRevision: command.expectedRevision,
				source: command.source,
				timestamp: command.timestamp,
				type: "breakpoints.set",
				breakpoints: effective,
			},
			command,
		],
	};
}
