/**
 * @file CORE-P1A-012 — contract-level accessibility rules: the fixed
 * rule fixtures (missing alt, empty accessible name, skipped heading
 * level), fingerprint stability across unrelated edits, and the
 * ≤100 ms @1k-nodes evaluation budget.
 */

import type { EditorCapabilityMetadata } from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import type { EditorCapabilityRegistry } from "../../../types/editor-api.js";
import { evaluateContractRules } from "../a11y/contract-rules.js";

const IMAGE_METADATA: EditorCapabilityMetadata = {
	version: "1",
	styleTarget: "root",
	capabilities: {
		imageAdjust: [{ id: "main", srcPropPath: "src", altPropPath: "alt" }],
	},
};

const BUTTON_METADATA: EditorCapabilityMetadata = {
	version: "1",
	styleTarget: "root",
	capabilities: {
		inlineText: [{ id: "label", propPath: "label", format: "plain" }],
	},
};

const registry: EditorCapabilityRegistry = {
	forComponent: (type) =>
		type === "HeroImage"
			? IMAGE_METADATA
			: type === "CtaButton"
				? BUTTON_METADATA
				: undefined,
	forNode: () => undefined,
	listUsedFeatures: () => [],
};

function doc(content: readonly unknown[]): PuckData {
	return { root: { props: {} }, content, zones: {} } as PuckData;
}

describe("evaluateContractRules (CORE-P1A-012)", () => {
	it("flags images with a src but no alt (declared image targets)", () => {
		const issues = evaluateContractRules(
			doc([
				{ type: "HeroImage", props: { id: "img-1", src: "/a.png", alt: "" } },
				{ type: "HeroImage", props: { id: "img-2", src: "/b.png", alt: "B" } },
				{ type: "HeroImage", props: { id: "img-3" } },
			]),
			registry,
		);
		expect(issues.map((issue) => issue.fingerprint)).toEqual([
			"image-missing-alt:img-1:main",
		]);
		expect(issues[0]?.targetPropPath).toBe("alt");
	});

	it("flags interactive components with no accessible name", () => {
		const issues = evaluateContractRules(
			doc([
				{ type: "CtaButton", props: { id: "btn-1", label: "" } },
				{ type: "CtaButton", props: { id: "btn-2", label: "Buy" } },
				// Undeclared interactive type falls back to common name props.
				{ type: "LinkCard", props: { id: "link-1", title: "" } },
				{ type: "LinkCard", props: { id: "link-2", title: "Read more" } },
			]),
			registry,
		);
		expect(issues.map((issue) => issue.fingerprint)).toEqual([
			"empty-accessible-name:btn-1",
			"empty-accessible-name:link-1",
		]);
	});

	it("flags skipped heading levels in document order", () => {
		const issues = evaluateContractRules(
			doc([
				{ type: "Heading", props: { id: "h-1", level: 1 } },
				{ type: "Heading", props: { id: "h-2", level: 2 } },
				{ type: "Heading", props: { id: "h-3", level: 4 } },
				{ type: "Heading", props: { id: "h-4", level: 2 } },
			]),
			registry,
		);
		expect(issues.map((issue) => issue.fingerprint)).toEqual([
			"skipped-heading-level:h-3",
		]);
		expect(issues[0]?.severity).toBe("warning");
	});

	it("keeps fingerprints stable across unrelated edits", () => {
		const before = evaluateContractRules(
			doc([
				{ type: "HeroImage", props: { id: "img-1", src: "/a.png" } },
				{ type: "Text", props: { id: "t-1", text: "hello" } },
			]),
			registry,
		);
		const after = evaluateContractRules(
			doc([
				{ type: "HeroImage", props: { id: "img-1", src: "/a.png" } },
				// Unrelated edit + new sibling: the fingerprint must not move.
				{ type: "Text", props: { id: "t-1", text: "changed" } },
				{ type: "Text", props: { id: "t-2", text: "new" } },
			]),
			registry,
		);
		expect(before.map((issue) => issue.fingerprint)).toEqual(
			after.map((issue) => issue.fingerprint),
		);
	});

	it("evaluates 1k nodes within the ≤100 ms budget", () => {
		const content = Array.from({ length: 1000 }, (_, index) => ({
			type: index % 3 === 0 ? "HeroImage" : "CtaButton",
			props: {
				id: `node-${index}`,
				src: "/img.png",
				alt: index % 6 === 0 ? "" : "ok",
				label: index % 5 === 0 ? "" : "Go",
			},
		}));
		const startedAt = performance.now();
		const issues = evaluateContractRules(doc(content), registry);
		const elapsed = performance.now() - startedAt;
		expect(issues.length).toBeGreaterThan(0);
		expect(elapsed).toBeLessThan(100);
	});
});
