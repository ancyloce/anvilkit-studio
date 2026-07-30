/**
 * `buildExportStylesheet` suite (PLAN-0020 CORE-P2-012 / EP-17;
 * REVIEW-0019 P0): determinism, §24.3 precedence through the export
 * path, desktop-first media blocks with skip-equal restatement,
 * token modes, un-hiding via `display: revert`, and materialized-
 * instance authoring.
 */

import type {
	AuthoringStateV1,
	BreakpointDefinition,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import { buildExportStylesheet } from "../index.js";

function px(value: number) {
	return { kind: "unit", value, unit: "px" } as const;
}

const red = {
	kind: "literal",
	value: { kind: "hex", value: "#ff0000" },
} as const;

const blue = {
	kind: "literal",
	value: { kind: "hex", value: "#0000ff" },
} as const;

function emptyAuthoring(): AuthoringStateV1 {
	return {
		version: "1",
		revision: 0,
		breakpoints: [],
		nodes: {},
		tokens: {},
		tokenModes: {},
		styleDefinitions: {},
		componentDefinitions: {},
		interactions: {},
		bindings: {},
	};
}

const tablet: BreakpointDefinition = {
	id: "tablet",
	label: "Tablet",
	maxWidth: 991,
	order: 0,
	enabled: true,
};

const mobile: BreakpointDefinition = {
	id: "mobile",
	label: "Mobile",
	maxWidth: 600,
	order: 1,
	enabled: true,
};

describe("buildExportStylesheet", () => {
	it("returns empty output for empty authoring", () => {
		const result = buildExportStylesheet({ authoring: emptyAuthoring() });
		expect(result.css).toBe("");
		expect(result.styledNodeIds.size).toBe(0);
		expect(result.diagnostics).toEqual([]);
	});

	it("emits a deterministic base rule per styled node", () => {
		const authoring: AuthoringStateV1 = {
			...emptyAuthoring(),
			nodes: {
				hero: {
					version: "1",
					layout: { base: { display: "flex", gap: px(12) } },
					typography: { base: { color: { kind: "token", tokenId: "brand" } } },
				},
			},
			tokens: {
				brand: {
					id: "brand",
					path: ["color"],
					name: "Brand",
					type: "color",
					values: { default: red },
				},
			},
		};
		const result = buildExportStylesheet({ authoring });
		expect(result.css).toBe(
			'[data-ak-node="hero"] { display: flex; gap: 12px; color: #ff0000; }',
		);
		expect([...result.styledNodeIds]).toEqual(["hero"]);
		expect(result.diagnostics).toEqual([]);
	});

	it("emits desktop-first media blocks and skips unchanged layers", () => {
		const authoring: AuthoringStateV1 = {
			...emptyAuthoring(),
			breakpoints: [tablet, mobile],
			nodes: {
				hero: {
					version: "1",
					layout: {
						base: { display: "flex", gap: px(24) },
						overrides: { tablet: { gap: px(12) } },
					},
				},
			},
		};
		const result = buildExportStylesheet({ authoring });
		const lines = result.css.split("\n");
		expect(lines).toEqual([
			'[data-ak-node="hero"] { display: flex; gap: 24px; }',
			'@media (max-width: 991px) { [data-ak-node="hero"] { display: flex; gap: 12px; } }',
		]);
		// The mobile layer resolves identically to tablet, so no
		// max-width:600px block exists at all.
		expect(result.css).not.toContain("600px");
	});

	it("applies style definitions below node values (§24.3)", () => {
		const authoring: AuthoringStateV1 = {
			...emptyAuthoring(),
			nodes: {
				card: {
					version: "1",
					styleRefs: { base: ["cardStyle"] },
					style: { base: { opacity: 0.5 } },
				},
			},
			styleDefinitions: {
				cardStyle: {
					version: "1",
					id: "cardStyle",
					name: "Card",
					appliesTo: "any",
					style: {
						base: { background: { kind: "solid", color: red }, opacity: 1 },
					},
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			},
		};
		const result = buildExportStylesheet({ authoring });
		// Definition supplies background; the node's own opacity wins.
		expect(result.css).toBe(
			'[data-ak-node="card"] { background: #ff0000; opacity: 0.5; }',
		);
	});

	it("bakes the requested token mode with §15.1 fallback", () => {
		const authoring: AuthoringStateV1 = {
			...emptyAuthoring(),
			nodes: {
				hero: {
					version: "1",
					typography: { base: { color: { kind: "token", tokenId: "brand" } } },
				},
			},
			tokenModes: {
				default: { id: "default", name: "Default" },
				dark: { id: "dark", name: "Dark" },
			},
			tokens: {
				brand: {
					id: "brand",
					path: ["color"],
					name: "Brand",
					type: "color",
					values: { default: red, dark: blue },
				},
			},
		};
		expect(buildExportStylesheet({ authoring }).css).toContain("#ff0000");
		expect(
			buildExportStylesheet({ authoring, tokenMode: "dark" }).css,
		).toContain("#0000ff");
		expect(
			buildExportStylesheet({
				authoring,
				tokenMode: "missing",
				defaultTokenMode: "dark",
			}).css,
		).toContain("#0000ff");
	});

	it("drops unresolvable token properties with a diagnostic", () => {
		const authoring: AuthoringStateV1 = {
			...emptyAuthoring(),
			nodes: {
				hero: {
					version: "1",
					layout: { base: { display: "grid" } },
					typography: { base: { color: { kind: "token", tokenId: "ghost" } } },
				},
			},
		};
		const result = buildExportStylesheet({ authoring });
		expect(result.css).toBe('[data-ak-node="hero"] { display: grid; }');
		expect(
			result.diagnostics.some((entry) =>
				entry.message.includes('token "ghost" cannot be resolved'),
			),
		).toBe(true);
	});

	it("un-hides across layers with display: revert", () => {
		const authoring: AuthoringStateV1 = {
			...emptyAuthoring(),
			breakpoints: [tablet],
			nodes: {
				banner: {
					version: "1",
					layout: { base: { width: px(320) } },
					hidden: { base: true, overrides: { tablet: false } },
				},
			},
		};
		const result = buildExportStylesheet({ authoring });
		expect(result.css.split("\n")).toEqual([
			'[data-ak-node="banner"] { width: 320px; display: none; }',
			'@media (max-width: 991px) { [data-ak-node="banner"] { width: 320px; display: revert; } }',
		]);
	});

	it("styles materialized-instance runtime nodes", () => {
		const result = buildExportStylesheet({
			authoring: emptyAuthoring(),
			instanceAuthoring: {
				"inst::title": { style: { base: { opacity: 0.75 } } },
			},
		});
		expect(result.css).toBe('[data-ak-node="inst::title"] { opacity: 0.75; }');
		expect([...result.styledNodeIds]).toEqual(["inst::title"]);
	});

	it("is byte-identical across runs", () => {
		const authoring: AuthoringStateV1 = {
			...emptyAuthoring(),
			breakpoints: [mobile, tablet],
			nodes: {
				b: { version: "1", layout: { base: { display: "flex" } } },
				a: {
					version: "1",
					layout: {
						base: { gap: px(8) },
						overrides: { mobile: { gap: px(4) } },
					},
				},
			},
		};
		const first = buildExportStylesheet({ authoring });
		const second = buildExportStylesheet({ authoring });
		expect(first.css).toBe(second.css);
		// Node order is id-sorted regardless of object insertion order.
		expect(first.css.indexOf('"a"')).toBeLessThan(first.css.indexOf('"b"'));
	});
});
