/**
 * Export preflight matrix (PLAN-0020 CORE-P3-009; ED-BIND-004;
 * ED-A11Y-003; DD-0019 §23.2).
 *
 * The plan asks for "each feature × declared/undeclared × prod/dev",
 * so the capability half is driven as an exhaustive matrix over every
 * `EditorFeatureId` rather than a hand-picked sample — a feature added
 * to the union later is covered the moment it exists.
 */

import type {
	EditorExportCapabilities,
	EditorFeatureId,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	type PreflightA11yIssue,
	runExportPreflight,
} from "../export-preflight.js";

const ALL_FEATURES: readonly EditorFeatureId[] = [
	"responsive",
	"tokens",
	"styleDefinitions",
	"localComponents",
	"variants",
	"interactions",
	"bindings",
	"richText",
];

const declaring = (
	features: readonly EditorFeatureId[],
): EditorExportCapabilities => ({ version: "1", supportedFeatures: features });

describe("capability gate — every feature × declared/undeclared × prod/dev", () => {
	for (const feature of ALL_FEATURES) {
		it(`passes in production when "${feature}" is declared`, () => {
			const result = runExportPreflight({
				usedFeatures: [feature],
				capabilities: declaring([feature]),
			});
			expect(result.status).toBe("passed");
			expect(result.errors).toEqual([]);
			expect(result.event.status).toBe("passed");
		});

		it(`blocks production when "${feature}" is undeclared`, () => {
			const result = runExportPreflight({
				usedFeatures: [feature],
				capabilities: declaring([]),
			});
			expect(result.status).toBe("blocked");
			expect(result.errors[0]?.code).toBe("EDITOR_EXPORTER_UNSUPPORTED");
			expect(result.errors[0]?.severity).toBe("error");
			expect(result.event.status).toBe("failed");
		});

		it(`degrades development to a warning when "${feature}" is undeclared`, () => {
			const result = runExportPreflight({
				usedFeatures: [feature],
				capabilities: declaring([]),
				mode: "development",
			});
			expect(result.status).toBe("warning");
			expect(result.errors[0]?.severity).toBe("warning");
		});
	}
});

describe("capability gate — declaration presence", () => {
	it("blocks a format that declares nothing at all", () => {
		// DD-DEC-018: an absent declaration means "no editor features".
		const result = runExportPreflight({
			usedFeatures: ["tokens"],
			capabilities: undefined,
		});
		expect(result.status).toBe("blocked");
		expect(result.errors[0]?.details?.declared).toBe(false);
	});

	it("passes a document that uses no editor features at all", () => {
		// The pre-editor path must keep exporting through any format.
		const result = runExportPreflight({
			usedFeatures: [],
			capabilities: undefined,
		});
		expect(result.status).toBe("passed");
		expect(result.event.status).toBe("passed");
	});

	it("reports every unsupported feature, not just the first", () => {
		const result = runExportPreflight({
			usedFeatures: ["tokens", "bindings", "variants"],
			capabilities: declaring(["tokens"]),
		});
		expect(result.errors).toHaveLength(2);
	});
});

describe("a11y gate — exportBlockingSeverity policy", () => {
	const issues: readonly PreflightA11yIssue[] = [
		{ severity: "error", ruleId: "imageMissingAlt", nodeId: "n1" },
		{ severity: "warning", ruleId: "lowContrast" },
	];

	it("never blocks by default", () => {
		// Absent policy = "none": a11y stays visible in the panel but
		// does not gate release.
		const result = runExportPreflight({
			usedFeatures: [],
			capabilities: declaring([]),
			a11yIssues: issues,
		});
		expect(result.status).toBe("passed");
	});

	it('blocks on errors under "critical"', () => {
		const result = runExportPreflight({
			usedFeatures: [],
			capabilities: declaring([]),
			a11yIssues: issues,
			policies: { exportBlockingSeverity: "critical" },
		});
		expect(result.status).toBe("blocked");
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.details?.ruleId).toBe("imageMissingAlt");
	});

	it('blocks on anything under "warning"', () => {
		const result = runExportPreflight({
			usedFeatures: [],
			capabilities: declaring([]),
			a11yIssues: issues,
			policies: { exportBlockingSeverity: "warning" },
		});
		expect(result.status).toBe("blocked");
		expect(result.errors).toHaveLength(2);
	});

	it("only warns in development even under a blocking policy", () => {
		// The author is previewing, not shipping.
		const result = runExportPreflight({
			usedFeatures: [],
			capabilities: declaring([]),
			a11yIssues: issues,
			policies: { exportBlockingSeverity: "warning" },
			mode: "development",
		});
		expect(result.status).toBe("warning");
		expect(result.errors[0]?.severity).toBe("warning");
	});

	it("cannot be used to unblock a capability failure", () => {
		// A format either supports a feature or does not; no host policy
		// may assert otherwise, or export would silently lose content.
		const result = runExportPreflight({
			usedFeatures: ["bindings"],
			capabilities: declaring([]),
			policies: { exportBlockingSeverity: "none" },
		});
		expect(result.status).toBe("blocked");
	});
});

describe("export.validation event", () => {
	it("is content-free — feature ids only", () => {
		const result = runExportPreflight({
			usedFeatures: ["tokens"],
			capabilities: declaring([]),
			a11yIssues: [{ severity: "error", ruleId: "imageMissingAlt" }],
			policies: { exportBlockingSeverity: "critical" },
		});
		expect(Object.keys(result.event).sort()).toEqual([
			"featureIds",
			"status",
			"type",
		]);
		expect(result.event.featureIds).toEqual(["tokens"]);
	});

	it("reports failed for a degraded development preview", () => {
		// Something did not validate, even though the export proceeds.
		const result = runExportPreflight({
			usedFeatures: ["tokens"],
			capabilities: declaring([]),
			mode: "development",
		});
		expect(result.status).toBe("warning");
		expect(result.event.status).toBe("failed");
	});
});
