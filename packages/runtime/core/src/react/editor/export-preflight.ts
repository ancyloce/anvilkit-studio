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
 *
 * ### Why `a11yIssues` defaults to the live issue set (CORE-P4-008)
 *
 * `EditorPolicies.exportBlockingSeverity` decides whether accessibility
 * findings block an export. That policy was unreachable in practice:
 * the editor produces `AccessibilityIssue` (with a `rule` field) while
 * the preflight consumes `PreflightA11yIssue` (with `ruleId`), and
 * neither type was exported to a host — so "critical issues block" could
 * never actually happen. This hook now reads the live issues itself and
 * maps them, which is what a *policy* should mean: the host sets it and
 * it works. An explicit `a11yIssues` argument still wins, for hosts that
 * source findings from their own audit.
 */

import type {
	EditorExportCapabilities,
	EditorFeatureId,
} from "@anvilkit/contracts/editor";
import { use, useMemo } from "react";
import {
	type EditorFeatureScanDocument,
	type ExportPreflightResult,
	listUsedEditorFeatures,
	type PreflightA11yIssue,
	runExportPreflight,
} from "../../editor/index.js";
import type { AccessibilityIssue } from "./a11y/contract-rules.js";
import { useAccessibilityIssues } from "./a11y/use-accessibility-issues.js";
import type { InternalEditorCommandPort } from "./command-port.js";
import { StudioEditorBridgeContext } from "./use-studio-editor.js";

/** Inputs the caller supplies per export attempt. */
export interface UseExportPreflightInput {
	/** The format the user chose, or `undefined` before they choose. */
	readonly capabilities: EditorExportCapabilities | undefined;
	/**
	 * Outstanding accessibility findings. Defaults to the editor's own
	 * live issue set; pass an explicit array to override (or an empty
	 * array to opt this document out of the a11y gate entirely).
	 */
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
	// `readData` is an internal seam, not part of the plugin-facing
	// port — the same cast `useCreateComponent` uses.
	const port = bridge?.port as InternalEditorCommandPort | null | undefined;
	const policies = bridge?.editorConfig?.policies;
	const { capabilities, a11yIssues, mode } = input;
	const live = useAccessibilityIssues();
	const liveIssues = live?.issues;

	const effectiveIssues = useMemo(
		() =>
			a11yIssues ??
			(liveIssues === undefined
				? undefined
				: toPreflightA11yIssues(liveIssues)),
		[a11yIssues, liveIssues],
	);

	return useMemo(() => {
		if (port == null) return null;
		const authoring = port.getSnapshot().authoring;
		// The document, not just the sidecar: `richText` lives in
		// component props and is invisible to a sidecar-only scan
		// (DD-DEC-018).
		const usedFeatures: readonly EditorFeatureId[] = listUsedEditorFeatures(
			authoring,
			port.readData() as EditorFeatureScanDocument,
		);
		return runExportPreflight({
			usedFeatures,
			capabilities,
			...(effectiveIssues === undefined ? {} : { a11yIssues: effectiveIssues }),
			...(policies === undefined ? {} : { policies }),
			...(mode === undefined ? {} : { mode }),
		});
	}, [port, capabilities, effectiveIssues, policies, mode]);
}

/**
 * Map the editor's own findings onto the preflight's input shape.
 *
 * The two types differ by exactly one field name (`rule` vs `ruleId`),
 * which is enough to make them structurally incompatible — so this
 * conversion is exported rather than left as an exercise for every
 * host that wants the a11y export policy to work.
 */
export function toPreflightA11yIssues(
	issues: readonly AccessibilityIssue[],
): readonly PreflightA11yIssue[] {
	return issues.map((issue) => ({
		severity: issue.severity,
		ruleId: issue.rule,
		nodeId: issue.nodeId,
	}));
}
