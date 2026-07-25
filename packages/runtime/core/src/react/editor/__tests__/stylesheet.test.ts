/**
 * @file CORE-P1A-009 — authoring CSS emission: the §12.4 exact shape
 * (deterministic order; media queries max-width descending; override
 * deltas only), `hidden` compiling to `display:none`, incremental
 * fragment-cache reuse, and iframe application idempotence.
 */

import type { AuthoringStateV1 } from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import { createEmptyAuthoringState } from "../../../editor/index.js";
import {
	applyAuthoringStylesheet,
	buildAuthoringStylesheet,
	createStylesheetCache,
} from "../responsive/stylesheet.js";

const BREAKPOINTS = [
	{ id: "tablet", label: "Tablet", maxWidth: 991, order: 0, enabled: true },
	{ id: "mobile", label: "Mobile", maxWidth: 767, order: 1, enabled: true },
	{ id: "off", label: "Off", maxWidth: 479, order: 2, enabled: false },
] as const;

function seeded(): AuthoringStateV1 {
	return {
		...createEmptyAuthoringState(),
		breakpoints: [...BREAKPOINTS],
		nodes: {
			"node-b": {
				version: "1",
				layout: {
					base: { display: "flex" },
					overrides: { mobile: { display: "block" } },
				},
			},
			"node-a": {
				version: "1",
				style: { base: { opacity: 0.5 } },
				hidden: { overrides: { tablet: true } },
			},
		},
	};
}

describe("buildAuthoringStylesheet (§12.4)", () => {
	it("emits base rules then media blocks in descending max-width order", () => {
		const css = buildAuthoringStylesheet(seeded(), [...BREAKPOINTS]);
		expect(css).toBe(
			[
				'[data-ak-node="node-a"] { opacity: 0.5; }',
				'[data-ak-node="node-b"] { display: flex; }',
				'@media (max-width: 991px) { [data-ak-node="node-a"] { display: none; } }',
				'@media (max-width: 767px) { [data-ak-node="node-b"] { display: block; } }',
			].join("\n"),
		);
	});

	it("is byte-deterministic across builds and node insertion order", () => {
		const reordered: AuthoringStateV1 = {
			...seeded(),
			nodes: Object.fromEntries(Object.entries(seeded().nodes).reverse()),
		};
		expect(buildAuthoringStylesheet(seeded(), [...BREAKPOINTS])).toBe(
			buildAuthoringStylesheet(reordered, [...BREAKPOINTS]),
		);
	});

	it("skips disabled breakpoints and empty layers", () => {
		const css = buildAuthoringStylesheet(seeded(), [...BREAKPOINTS]);
		expect(css).not.toContain("479");
		expect(css).not.toContain("@media (max-width: 479px)");
	});

	it("reuses cached fragments for unchanged records (incremental)", () => {
		const cache = createStylesheetCache();
		const first = seeded();
		buildAuthoringStylesheet(first, [...BREAKPOINTS], cache);
		const fragmentA = cache.get("node-a");

		// Change node-b only, preserving node-a's record reference —
		// exactly what the reducers' reference-preservation guarantees.
		const next: AuthoringStateV1 = {
			...first,
			nodes: {
				...first.nodes,
				"node-b": {
					version: "1",
					layout: { base: { display: "grid" } },
				},
			},
		};
		const css = buildAuthoringStylesheet(next, [...BREAKPOINTS], cache);
		expect(cache.get("node-a")).toBe(fragmentA);
		expect(css).toContain('[data-ak-node="node-b"] { display: grid; }');

		// Removed nodes drop out of the cache.
		const emptied = { ...first, nodes: {} };
		expect(buildAuthoringStylesheet(emptied, [...BREAKPOINTS], cache)).toBe("");
		expect(cache.size).toBe(0);
	});

	it("escapes hostile node ids in attribute selectors", () => {
		const hostile: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			nodes: {
				'evil"] * { color: red } [x="': {
					version: "1",
					style: { base: { opacity: 1 } },
				},
			},
		};
		const css = buildAuthoringStylesheet(hostile, []);
		expect(css).toContain('\\"');
		expect(css).not.toContain('="evil"]');
	});
});

describe("applyAuthoringStylesheet", () => {
	it("creates the scoped style element once and updates only on change", () => {
		const doc = document.implementation.createHTMLDocument();
		const element = applyAuthoringStylesheet(doc, "a { color: red }");
		expect(element.id).toBe("ak-authoring-styles");
		expect(doc.getElementById("ak-authoring-styles")).toBe(element);

		const again = applyAuthoringStylesheet(doc, "a { color: red }");
		expect(again).toBe(element);
		expect(doc.querySelectorAll("style").length).toBe(1);

		applyAuthoringStylesheet(doc, "b { color: blue }");
		expect(element.textContent).toBe("b { color: blue }");
	});
});
