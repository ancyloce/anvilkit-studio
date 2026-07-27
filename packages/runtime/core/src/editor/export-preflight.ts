/**
 * @file Production export preflight (PLAN-0020 CORE-P3-009;
 * ED-BIND-004; ED-A11Y-003; DD-0019 §23.2; DD-DEC-018).
 *
 * One decision point in front of export, combining two independent
 * gates so a host cannot satisfy one and forget the other:
 *
 * 1. **Capability** — do the features this document uses exist in the
 *    chosen format's declaration? `validateExportCapabilities` in
 *    `@anvilkit/ir/editor` already answers that; this module does not
 *    re-implement it, it composes it.
 * 2. **Accessibility** — should outstanding a11y issues stop the
 *    export? That is host policy (`EditorPolicies.exportBlockingSeverity`),
 *    not a Core opinion.
 *
 * ### Development degrades, production blocks
 *
 * §23.2's asymmetry is deliberate and preserved here: in development
 * an unsupported feature produces a persistent warning so the author
 * can keep working and see the problem, while in production the same
 * condition blocks. A preview that silently dropped features would
 * teach authors to trust output that will not ship.
 *
 * ### Why a11y severity is policy and capability is not
 *
 * A format either supports a feature or does not — that is a fact
 * about the exporter, and no host setting should be able to assert
 * otherwise (a "ship it anyway" switch would produce output that
 * silently loses content). Whether a contrast warning should stop a
 * release, by contrast, is a genuine organisational choice, which is
 * why only that half is policy-driven.
 */

import type {
	EditorError,
	EditorExportCapabilities,
	EditorFeatureId,
	EditorPolicies,
} from "@anvilkit/contracts/editor";
import { validateExportCapabilities } from "@anvilkit/ir/editor";

/** An accessibility finding, as the a11y panel produces them. */
export interface PreflightA11yIssue {
	readonly severity: "error" | "warning";
	readonly ruleId: string;
	readonly nodeId?: string;
}

/** Inputs to {@link runExportPreflight}. */
export interface ExportPreflightInput {
	readonly usedFeatures: readonly EditorFeatureId[];
	readonly capabilities: EditorExportCapabilities | undefined;
	readonly a11yIssues?: readonly PreflightA11yIssue[];
	readonly policies?: EditorPolicies;
	/** `"production"` (default) blocks; `"development"` degrades. */
	readonly mode?: "production" | "development";
}

/** The preflight verdict. */
export interface ExportPreflightResult {
	/** `blocked` stops export; `warning` proceeds with a persistent notice. */
	readonly status: "passed" | "warning" | "blocked";
	readonly usedFeatures: readonly EditorFeatureId[];
	/** Capability + a11y findings, capability first. */
	readonly errors: readonly EditorError[];
	/** Payload for the `export.validation` event — content-free. */
	readonly event: ExportValidationEvent;
}

/**
 * The content-free `export.validation` payload (DD-0019 §22.4).
 * Named so `runExport`'s sink can be typed without re-declaring it
 * (PLAN-0020 CORE-P4-004).
 */
export interface ExportValidationEvent {
	readonly type: "export.validation";
	readonly status: "passed" | "failed";
	readonly featureIds: readonly string[];
}

/**
 * Which a11y issues block, per host policy.
 *
 * `"none"` (the default) never blocks on accessibility — a11y issues
 * remain visible in the panel either way. `"critical"` blocks on
 * errors. `"warning"` blocks on anything.
 */
function blockingA11yIssues(
	issues: readonly PreflightA11yIssue[],
	severity: EditorPolicies["exportBlockingSeverity"],
): readonly PreflightA11yIssue[] {
	if (severity === "warning") return issues;
	if (severity === "critical") {
		return issues.filter((issue) => issue.severity === "error");
	}
	return [];
}

/**
 * Run the preflight.
 *
 * Pure and total. Returns a verdict plus the event payload; emitting
 * the event and honouring the verdict belong to the caller, so this
 * stays testable as a matrix without an export pipeline.
 */
export function runExportPreflight(
	input: ExportPreflightInput,
): ExportPreflightResult {
	const mode = input.mode ?? "production";
	const capability = validateExportCapabilities(
		input.usedFeatures,
		input.capabilities,
		{ mode },
	);

	const blocking = blockingA11yIssues(
		input.a11yIssues ?? [],
		input.policies?.exportBlockingSeverity,
	);
	const a11yErrors: readonly EditorError[] = blocking.map((issue) => ({
		code: "EDITOR_CAPABILITY_UNSUPPORTED",
		// In development an a11y policy still only warns: the author is
		// previewing, not shipping.
		severity: mode === "production" ? "error" : "warning",
		message: `accessibility issue "${issue.ruleId}" blocks export under the host's exportBlockingSeverity policy`,
		recoverable: true,
		details: {
			kind: "a11y",
			ruleId: issue.ruleId,
			issueSeverity: issue.severity,
			...(issue.nodeId === undefined ? {} : { nodeId: issue.nodeId }),
		},
	}));

	const errors = [...capability.errors, ...a11yErrors];
	const status = resolveStatus(capability.status, a11yErrors.length > 0, mode);

	return {
		status,
		usedFeatures: capability.usedFeatures,
		errors,
		event: {
			type: "export.validation",
			// The event's vocabulary is binary (§21 events are
			// content-free); a degraded development preview reports
			// `failed` because something did not validate, even though the
			// export proceeds.
			status: status === "passed" ? "passed" : "failed",
			featureIds: capability.usedFeatures,
		},
	};
}

function resolveStatus(
	capabilityStatus: "passed" | "warning" | "blocked",
	hasA11yBlockers: boolean,
	mode: "production" | "development",
): "passed" | "warning" | "blocked" {
	if (capabilityStatus === "blocked") return "blocked";
	if (hasA11yBlockers) return mode === "production" ? "blocked" : "warning";
	return capabilityStatus;
}
