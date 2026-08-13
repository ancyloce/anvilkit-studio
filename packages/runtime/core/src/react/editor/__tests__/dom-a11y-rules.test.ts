/**
 * @file CORE-P1B-011 — DOM accessibility rules: fixture per rule,
 * incremental scanner (mutation-idle debounce + 2 s full-scan
 * throttle + manual bypass), and deterministic 1k-node scale coverage.
 * Wall-clock measurements belong in the opt-in `bench:editor` surface,
 * never in the jsdom unit gate (review 0037 P2-11).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createDomAccessibilityScanner,
	DOM_SCAN_IDLE_MS,
	evaluateDomRules,
} from "../a11y/dom-rules/index.js";
import { createStudioEditorBridge } from "../bridge.js";

afterEach(() => {
	vi.useRealTimers();
});

function docWith(html: string): Document {
	const doc = document.implementation.createHTMLDocument();
	doc.body.innerHTML = html;
	return doc;
}

describe("evaluateDomRules (CORE-P1B-011)", () => {
	it("flags duplicate DOM ids", () => {
		const issues = evaluateDomRules(
			docWith(`<div id="x"></div><span id="x"></span><p id="y"></p>`),
		);
		expect(issues.filter((i) => i.rule === "duplicate-dom-id")).toHaveLength(1);
	});

	it("flags unlabelled form controls and honors every labelling channel", () => {
		const issues = evaluateDomRules(
			docWith(`
				<input id="bare" />
				<input aria-label="ok" />
				<label>wrapped <input /></label>
				<label for="assoc">assoc</label><input id="assoc" />
			`),
		);
		const missing = issues.filter((i) => i.rule === "missing-label");
		expect(missing).toHaveLength(1);
		expect(missing[0]?.fingerprint).toContain("bare");
	});

	it("flags nested interactive elements and autoplaying media", () => {
		const issues = evaluateDomRules(
			docWith(`
				<button>outer <a href="/x">inner</a></button>
				<video autoplay></video>
				<video autoplay muted></video>
			`),
		);
		expect(issues.some((i) => i.rule === "nested-interactive")).toBe(true);
		expect(issues.filter((i) => i.rule === "autoplay-media")).toHaveLength(1);
	});

	it("flags small touch targets via measured rects", () => {
		const doc = docWith(
			`<div data-ak-node="n-1"><button id="tiny">x</button></div>`,
		);
		const tiny = doc.getElementById("tiny") as HTMLElement;
		tiny.getBoundingClientRect = () =>
			({ width: 12, height: 40, top: 0, left: 0 }) as DOMRect;
		const issues = evaluateDomRules(doc);
		const target = issues.find((i) => i.rule === "touch-target-small");
		expect(target?.nodeId).toBe("n-1");
		expect(target?.fingerprint).toContain("12x40");
	});

	it("gives colliding issues unique fingerprints (duplicate-key regression)", () => {
		// Two sibling spans inside ONE node at the same contrast ratio
		// produce the same (rule, node, detail) triple; the browser
		// surfaced this as duplicate React keys in the issues list.
		// The contrast rule needs a `defaultView`, so this case runs
		// against the live test document rather than `docWith`.
		const host = document.createElement("div");
		host.setAttribute("data-ak-node", "n-1");
		host.innerHTML = `
			<span style="color: rgb(200,200,200); background-color: rgb(255,255,255)">one</span>
			<span style="color: rgb(200,200,200); background-color: rgb(255,255,255)">two</span>`;
		document.body.appendChild(host);
		const issues = evaluateDomRules(host).filter(
			(issue) => issue.rule === "low-contrast",
		);
		host.remove();
		expect(issues.length).toBeGreaterThan(1);
		expect(new Set(issues.map((issue) => issue.fingerprint)).size).toBe(
			issues.length,
		);
	});

	it("evaluates all 1k nodes with deterministic issue output", () => {
		const html = Array.from({ length: 1000 }, (_, index) =>
			index % 5 === 0
				? `<input id="i-${index}" />`
				: `<p id="p-${index}">text</p>`,
		).join("");
		const doc = docWith(html);
		const issues = evaluateDomRules(doc);
		const missingLabels = issues.filter(
			(issue) => issue.rule === "missing-label",
		);

		expect(doc.body.querySelectorAll("input, p")).toHaveLength(1000);
		expect(missingLabels).toHaveLength(200);
		expect(new Set(missingLabels.map((issue) => issue.fingerprint)).size).toBe(
			200,
		);
	});
});

describe("incremental scanner (CORE-P1B-011)", () => {
	it("scans after mutation idle, publishes to the bridge, and disposes cleanly", async () => {
		const bridge = createStudioEditorBridge();
		const doc = docWith(`<div id="host"></div>`);
		const scanner = createDomAccessibilityScanner(bridge, doc);
		expect(bridge.domIssues).toEqual([]);

		const input = doc.createElement("input");
		(doc.getElementById("host") as Element).appendChild(input);
		await new Promise((resolve) => setTimeout(resolve, DOM_SCAN_IDLE_MS + 100));
		expect(
			(bridge.domIssues as ReadonlyArray<{ rule: string }>).some(
				(issue) => issue.rule === "missing-label",
			),
		).toBe(true);

		scanner.dispose();
		expect(bridge.domIssues).toEqual([]);
	});

	it("scanNow bypasses the throttle", () => {
		const bridge = createStudioEditorBridge();
		const doc = docWith(`<input id="late" />`);
		const scanner = createDomAccessibilityScanner(bridge, doc);
		bridge.domIssues = [];
		scanner.scanNow();
		expect(bridge.domIssues.length).toBeGreaterThan(0);
		scanner.dispose();
	});
});
