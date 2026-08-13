"use client";

/**
 * @file Breakpoint materialization (PLAN-0020 CORE-P1A-008; §12.1).
 *
 * A document that declares no `designSystem.breakpoints` still offers
 * the effective preset as write targets (`effectiveBreakpoints`), but
 * `updateAppearanceInData` **rejects** a write at a layer the document
 * does not declare (`puck/update-appearance.ts`, the
 * `breakpoint "…" is not defined in the document design system` gate).
 * So the first write into a not-yet-declared layer must persist the
 * effective set first — and it must do so in the SAME history entry,
 * or one author intent becomes two undos.
 *
 * ### `p3-009`
 *
 * The old shape was `withBreakpointMaterialization(command, authoring,
 * effective)`: it wrapped an `AtomicEditorCommand` in a `batch`
 * carrying a synthesized `breakpoints.set`. Both the command IR and
 * the sidecar it read are gone. The behaviour survives as a
 * *precondition* instead of a wrapper — the caller ensures the layer
 * is declared, then performs its own single appearance commit — which
 * is the only expression available once there is no batch vocabulary
 * to fold two writes into one.
 *
 * The cost is honest and recorded: ensuring the layer and writing the
 * value are now two history entries the first time an author touches a
 * fresh breakpoint, where the batch made them one. Folding them back
 * together needs a commit helper that writes a root prop and a node
 * carrier in one `setData` — the same seam
 * `commitDesignSystemUpdateOver` opened for §12.2 deletion.
 */

import type {
	BreakpointDefinition,
	ResponsiveLayerRef,
} from "@anvilkit/contracts/editor";
import type { Data } from "@puckeditor/core";
import { documentBreakpoints } from "../../../puck/read-appearance.js";
import {
	commitDesignSystemUpdate,
	type DesignSystemCommitDeps,
} from "../../../puck/update-design-system.js";

/** Whether `layer` is writable against `data` without materializing. */
export function layerIsDeclared(
	data: Data,
	layer: ResponsiveLayerRef,
): boolean {
	return (
		layer === "base" ||
		documentBreakpoints(data).some((breakpoint) => breakpoint.id === layer)
	);
}

/**
 * Ensure the document declares `layer` before an appearance write.
 *
 * Returns `"ready"` when nothing was needed (base layer, or the
 * document already declares it), `"materialized"` when the effective
 * set was persisted, and `"unavailable"` when `layer` is not in the
 * effective set either — an unknown layer is left for the write itself
 * to reject rather than silently invented here.
 */
export function ensureBreakpointMaterialized(
	deps: DesignSystemCommitDeps,
	data: Data,
	layer: ResponsiveLayerRef,
	effective: readonly BreakpointDefinition[],
): "ready" | "materialized" | "unavailable" {
	if (layerIsDeclared(data, layer)) {
		return "ready";
	}
	if (!effective.some((breakpoint) => breakpoint.id === layer)) {
		return "unavailable";
	}
	const result = commitDesignSystemUpdate(deps, (current) => ({
		tokens: current?.tokens ?? {},
		tokenModes: current?.tokenModes ?? {},
		defaultTokenMode: current?.defaultTokenMode ?? "default",
		styleDefinitions: current?.styleDefinitions ?? {},
		breakpoints: effective,
	}));
	return result.status === "committed" ? "materialized" : "unavailable";
}
