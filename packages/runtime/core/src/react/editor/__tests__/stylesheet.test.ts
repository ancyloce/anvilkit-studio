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
		// Non-null on the default path: `applyAuthoringStylesheet` only
		// returns null when a host style adapter takes over injection
		// (CORE-P4-004), which this test does not supply.
		const element = applyAuthoringStylesheet(doc, "a { color: red }");
		expect(element).not.toBeNull();
		if (element === null) return;
		expect(element.id).toBe("ak-authoring-styles");
		expect(doc.getElementById("ak-authoring-styles")).toBe(element);

		const again = applyAuthoringStylesheet(doc, "a { color: red }");
		expect(again).toBe(element);
		expect(doc.querySelectorAll("style").length).toBe(1);

		applyAuthoringStylesheet(doc, "b { color: blue }");
		expect(element.textContent).toBe("b { color: blue }");
	});
});

/**
 * Regression: token-backed values on the live canvas.
 *
 * `resolveAuthoringStyle` is a pure serializer with no token
 * awareness, and this builder used to hand it the raw spec. A
 * `{kind:"token"}` value therefore serialized to nothing — the export
 * pipeline (which runs `resolveNodeAuthoring` first) emitted the
 * property correctly while the canvas silently dropped it, so
 * attaching a token made the value disappear from the page the author
 * was looking at.
 *
 * The fragment cache is the second half: it keyed on the node record
 * alone, and editing a token changes `authoring.tokens` without
 * touching any node record, so a token edit re-rendered nothing.
 */
describe("buildAuthoringStylesheet — token substitution (§15.1)", () => {
	const TOKEN_MODE = { tokenMode: "light" } as const;

	function withToken(px: number): AuthoringStateV1 {
		return {
			...createEmptyAuthoringState(),
			breakpoints: [],
			tokens: {
				"tok-1": {
					id: "tok-1",
					name: "size.hero",
					path: ["size", "hero"],
					type: "length",
					values: {
						light: {
							kind: "literal",
							value: { kind: "unit", value: px, unit: "px" },
						},
					},
				},
			},
			nodes: {
				"node-a": {
					version: "1",
					layout: { base: { width: { kind: "token", tokenId: "tok-1" } } },
				},
			},
		} as unknown as AuthoringStateV1;
	}

	it("emits the token's resolved literal, not nothing", () => {
		expect(
			buildAuthoringStylesheet(
				withToken(400),
				[],
				undefined,
				undefined,
				TOKEN_MODE,
			),
		).toBe('[data-ak-node="node-a"] { width: 400px; }');
	});

	it("re-emits when the token's value changes and the node record does not", () => {
		const cache = createStylesheetCache();
		const first = withToken(400);
		expect(
			buildAuthoringStylesheet(first, [], cache, undefined, TOKEN_MODE),
		).toContain("width: 400px;");

		// Same node record object, new token table — exactly what a token
		// edit in the design panel produces.
		const edited: AuthoringStateV1 = {
			...first,
			tokens: {
				"tok-1": {
					...(first.tokens as Record<string, { values: unknown }>)["tok-1"],
					values: {
						light: {
							kind: "literal",
							value: { kind: "unit", value: 640, unit: "px" },
						},
					},
				},
			},
		} as unknown as AuthoringStateV1;
		expect(edited.nodes["node-a"]).toBe(first.nodes["node-a"]);

		expect(
			buildAuthoringStylesheet(edited, [], cache, undefined, TOKEN_MODE),
		).toContain("width: 640px;");
	});

	it("still reuses cached fragments when the token table is unchanged", () => {
		const cache = createStylesheetCache();
		const stats = { hits: 0, misses: 0 };
		const state = withToken(400);
		buildAuthoringStylesheet(state, [], cache, stats, TOKEN_MODE);
		expect(stats).toEqual({ hits: 0, misses: 1 });
		buildAuthoringStylesheet(state, [], cache, stats, TOKEN_MODE);
		expect(stats).toEqual({ hits: 1, misses: 1 });
	});

	it("leaves an unresolvable reference out rather than emitting garbage", () => {
		const dangling = {
			...createEmptyAuthoringState(),
			breakpoints: [],
			nodes: {
				"node-a": {
					version: "1",
					layout: { base: { width: { kind: "token", tokenId: "missing" } } },
				},
			},
		} as unknown as AuthoringStateV1;
		expect(
			buildAuthoringStylesheet(dangling, [], undefined, undefined, TOKEN_MODE),
		).toBe("");
	});
});
