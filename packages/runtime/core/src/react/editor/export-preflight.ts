"use client";

/**
 * @file `useExportPreflight` — computes the §23.2 export verdict from
 * live editor state (PLAN-0020 CORE-P3-009; ED-BIND-004; DD-DEC-018).
 *
 * The split across three files is a layering consequence, not a
 * preference:
 *
 * - `editor/export-preflight.ts` decides (pure, testable as a matrix).
 * - This file gathers the inputs — used features from the live sidecar,
 *   the chosen format's declaration, host policies — because only the
 *   React layer can see them.
 * - `export/run-export.ts` *enforces* the verdict, and may not import
 *   `@anvilkit/ir` at all (`check:no-headless-import`), which is why it
 *   receives the result rather than computing it.
 *
 * Passing the verdict into `runExport` is what makes the block real:
 * a preflight nothing consumes is documentation, not a gate.
 */

import type {
	EditorExportCapabilities,
	EditorFeatureId,
} from "@anvilkit/contracts/editor";
import { use, useMemo } from "react";
import {
	type ExportPreflightResult,
	listUsedAuthoringFeatures,
	type PreflightA11yIssue,
	runExportPreflight,
} from "../../editor/index.js";
import { StudioEditorBridgeContext } from "./use-studio-editor.js";

/** Inputs the caller supplies per export attempt. */
export interface UseExportPreflightInput {
	/** The format the user chose, or `undefined` before they choose. */
	readonly capabilities: EditorExportCapabilities | undefined;
	/** Outstanding accessibility findings, if the host surfaces them. */
	readonly a11yIssues?: readonly PreflightA11yIssue[];
	/** `"production"` (default) blocks; `"development"` degrades. */
	readonly mode?: "production" | "development";
}

/**
 * The verdict for the current document and chosen format, or `null`
 * when the editor runtime is not mounted.
 *
 * `null` means "no editor features are in play" as far as export is
 * concerned — the pre-editor path, which must keep exporting through
 * any format. Callers pass `preflight ?? undefined` to `runExport`.
 */
export function useExportPreflight(
	input: UseExportPreflightInput,
): ExportPreflightResult | null {
	const bridge = use(StudioEditorBridgeContext);
	const port = bridge?.port;
	const policies = bridge?.editorConfig?.policies;
	const { capabilities, a11yIssues, mode } = input;

	return useMemo(() => {
		if (port == null) return null;
		const authoring = port.getSnapshot().authoring;
		const usedFeatures: readonly EditorFeatureId[] =
			listUsedAuthoringFeatures(authoring);
		return runExportPreflight({
			usedFeatures,
			capabilities,
			...(a11yIssues === undefined ? {} : { a11yIssues }),
			...(policies === undefined ? {} : { policies }),
			...(mode === undefined ? {} : { mode }),
		});
	}, [port, capabilities, a11yIssues, policies, mode]);
}
