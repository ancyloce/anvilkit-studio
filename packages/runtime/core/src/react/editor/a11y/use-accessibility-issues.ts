"use client";

/**
 * @file `useAccessibilityIssues` — reactive contract-rule evaluation
 * plus issue navigation (PLAN-0020 CORE-P1A-012).
 *
 * Re-evaluates after data changes (the bridge's data-version counter
 * ticks on every Puck change, so prop edits re-trigger even though
 * the sidecar is untouched) and memoizes per version — incremental
 * enough for the ≤100 ms @1k-nodes budget since evaluation is one
 * pure pass. Navigation selects the offending node through the
 * multi-selection controller, which lights the canvas ring, the
 * layer row, and the inspector in one step.
 */

import { use, useCallback, useMemo, useSyncExternalStore } from "react";
import { useStudioPluginContextOrNull } from "../../../studio/context/plugin-context.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import {
	type AccessibilityIssue,
	evaluateContractRules,
} from "./contract-rules.js";

/** Issues plus the navigate action, or `null` when the editor is off. */
export interface AccessibilityIssuesApi {
	readonly issues: readonly AccessibilityIssue[];
	/** Select the offending node (canvas + layers + inspector). */
	readonly navigateTo: (issue: AccessibilityIssue) => void;
}

/** Evaluate and expose contract-level accessibility issues. */
export function useAccessibilityIssues(): AccessibilityIssuesApi | null {
	const bridge = use(StudioEditorBridgeContext);
	const ctx = useStudioPluginContextOrNull();
	const dataVersion = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getDataVersion,
		bridge === null ? zero : bridge.getDataVersion,
	);

	const issues = useMemo(() => {
		if (bridge?.capabilities == null || ctx === null) {
			return null;
		}
		void dataVersion;
		const contract = evaluateContractRules(ctx.getData(), bridge.capabilities, {
			requireAltText: bridge.editorConfig?.policies?.requireAltText,
		});
		// DOM-rule results (CORE-P1B-011) join the same panel/navigation.
		const dom = bridge.domIssues as readonly AccessibilityIssue[];
		return [...contract, ...dom];
	}, [bridge, ctx, dataVersion]);

	const navigateTo = useCallback(
		(issue: AccessibilityIssue): void => {
			bridge?.selection?.select(issue.nodeId);
		},
		[bridge],
	);

	return issues === null ? null : { issues, navigateTo };
}

function noopSubscribe(): () => void {
	return noop;
}
function noop(): void {
	// The no-bridge store never changes.
}
function zero(): number {
	return 0;
}
