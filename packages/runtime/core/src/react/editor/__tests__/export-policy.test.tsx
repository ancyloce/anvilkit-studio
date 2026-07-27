/**
 * @file PLAN-0020 CORE-P4-008 — the accessibility export-blocking
 * policy, end to end (ED-A11Y-003; OQ-008; DD-0019 §23.2).
 *
 * The pure severity matrix lives in
 * `editor/__tests__/export-preflight.test.ts`. What this file covers is
 * the half that makes the policy real: that the editor's OWN
 * accessibility findings reach the preflight without the host
 * hand-mapping anything.
 *
 * That gap was the CORE-P4-008 finding. `AccessibilityIssue` carries
 * `rule`; `PreflightA11yIssue` wants `ruleId`. One field name apart is
 * enough to make them structurally incompatible — so "critical issues
 * block export" was a policy that could never fire.
 */

import type { EditorPolicies } from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import { runExportPreflight } from "../../../editor/export-preflight.js";
import type { AccessibilityIssue } from "../a11y/contract-rules.js";
import { toPreflightA11yIssues } from "../export-preflight.js";

const ISSUES: readonly AccessibilityIssue[] = [
	{
		fingerprint: "image-missing-alt:n1:media",
		rule: "image-missing-alt",
		severity: "error",
		nodeId: "n1",
		componentType: "Image",
		messageKey: "studio.editor.a11y.imageMissingAlt",
	},
	{
		fingerprint: "skipped-heading-level:n2",
		rule: "skipped-heading-level",
		severity: "warning",
		nodeId: "n2",
		componentType: "Heading",
		messageKey: "studio.editor.a11y.skippedHeadingLevel",
	},
];

/** A format that supports everything, so only a11y can block. */
const ALL_SUPPORTED = {
	version: "1",
	supportedFeatures: ["responsive", "tokens"],
} as const;

function preflight(policies?: EditorPolicies) {
	return runExportPreflight({
		usedFeatures: ["responsive"],
		capabilities: ALL_SUPPORTED,
		a11yIssues: toPreflightA11yIssues(ISSUES),
		...(policies === undefined ? {} : { policies }),
	});
}

describe("toPreflightA11yIssues", () => {
	it("maps the editor's `rule` onto the preflight's `ruleId`", () => {
		expect(toPreflightA11yIssues(ISSUES)).toEqual([
			{ severity: "error", ruleId: "image-missing-alt", nodeId: "n1" },
			{ severity: "warning", ruleId: "skipped-heading-level", nodeId: "n2" },
		]);
	});

	it("preserves severity exactly — the policy keys off it", () => {
		const mapped = toPreflightA11yIssues(ISSUES);
		expect(mapped.map((issue) => issue.severity)).toEqual(["error", "warning"]);
	});

	it("is total for an empty set", () => {
		expect(toPreflightA11yIssues([])).toEqual([]);
	});
});

describe("OQ-008 default — warn, never block", () => {
	it("does not block when the host set no policy", () => {
		// The recommended default: accessibility findings are surfaced in
		// the panel, but shipping is the author's call.
		expect(preflight().status).toBe("passed");
	});

	it('does not block under an explicit "none"', () => {
		expect(preflight({ exportBlockingSeverity: "none" }).status).toBe("passed");
	});
});

describe("policy matrix over real editor findings", () => {
	it('blocks on the error-severity finding under "critical"', () => {
		const result = preflight({ exportBlockingSeverity: "critical" });
		expect(result.status).toBe("blocked");
		// Exactly one of the two findings is an error, so exactly one
		// blocks — a policy that swept up the warning too would be
		// indistinguishable from "warning".
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.message).toContain("image-missing-alt");
	});

	it('blocks on both findings under "warning"', () => {
		const result = preflight({ exportBlockingSeverity: "warning" });
		expect(result.status).toBe("blocked");
		expect(result.errors).toHaveLength(2);
	});

	it("reports the block as a failed validation event", () => {
		expect(preflight({ exportBlockingSeverity: "critical" }).event).toEqual({
			type: "export.validation",
			status: "failed",
			featureIds: ["responsive"],
		});
	});

	it("names the policy in the message, so the author knows why", () => {
		const result = preflight({ exportBlockingSeverity: "critical" });
		expect(result.errors[0]?.message).toContain("exportBlockingSeverity");
	});
});

describe("the policy cannot be abused in either direction", () => {
	it('"none" still cannot unblock an unsupported feature', () => {
		// Capability failures are a correctness gate, not a preference.
		const result = runExportPreflight({
			usedFeatures: ["bindings"],
			capabilities: { version: "1", supportedFeatures: [] },
			a11yIssues: toPreflightA11yIssues(ISSUES),
			policies: { exportBlockingSeverity: "none" },
		});
		expect(result.status).toBe("blocked");
	});

	it("only warns in development, even under a blocking policy", () => {
		// An author previewing is not shipping; blocking the preview would
		// stop them from seeing the very issue they need to fix.
		const result = runExportPreflight({
			usedFeatures: ["responsive"],
			capabilities: ALL_SUPPORTED,
			a11yIssues: toPreflightA11yIssues(ISSUES),
			policies: { exportBlockingSeverity: "warning" },
			mode: "development",
		});
		expect(result.status).toBe("warning");
	});

	it("an explicitly empty issue list opts a document out entirely", () => {
		const result = runExportPreflight({
			usedFeatures: ["responsive"],
			capabilities: ALL_SUPPORTED,
			a11yIssues: [],
			policies: { exportBlockingSeverity: "warning" },
		});
		expect(result.status).toBe("passed");
	});
});
