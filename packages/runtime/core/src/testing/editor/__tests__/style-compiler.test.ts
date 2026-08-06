/**
 * @file PLAN-0025 P1-02/03/05 — unified appearance compiler contract.
 *
 * Pure-function coverage over `compileDocumentAppearance`: official
 * traversal (slots included), metadata-v2 allowlist enforcement,
 * design-system token resolution, styleRefs, hidden, deterministic
 * output + fingerprint, strict-mode escalation, and cache
 * transparency (cached output byte-identical to cold output).
 */

import type {
	AnvilAppearanceV1,
	DesignSystemV1,
} from "@anvilkit/contracts/editor";
import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { anvilRootAttrs, anvilTargetAttrs } from "../../../puck/targets.js";
import {
	compileDocumentAppearance,
	createAppearanceCompilerCache,
} from "../../../style-compiler/index.js";

const designSystem: DesignSystemV1 = {
	version: "1",
	breakpoints: [
		{
			id: "bp-tablet",
			label: "Tablet",
			maxWidth: 1024,
			order: 0,
			enabled: true,
		},
	],
	tokens: {
		"tok-ink": {
			id: "tok-ink",
			path: ["color", "tok-ink"],
			name: "Ink",
			type: "color",
			values: {
				light: {
					kind: "literal",
					value: { kind: "rgba", r: 17, g: 34, b: 68, a: 1 },
				},
			},
			description: "",
		},
	},
	tokenModes: { light: { id: "light", name: "Light" } },
	defaultTokenMode: "light",
	styleDefinitions: {
		"sd-card": {
			version: "1",
			id: "sd-card",
			name: "Card",
			appliesTo: "any",
			layout: { base: { gap: { kind: "unit", value: 8, unit: "px" } } },
			createdAt: "2026-08-04T00:00:00.000Z",
			updatedAt: "2026-08-04T00:00:00.000Z",
		},
	},
};

const heroAppearance: AnvilAppearanceV1 = {
	version: "1",
	targets: {
		root: {
			style: {
				base: {
					layout: {
						display: "flex",
						gap: { kind: "unit", value: 16, unit: "px" },
					},
					typography: { color: { kind: "token", tokenId: "tok-ink" } },
				},
				overrides: {
					"bp-tablet": {
						layout: { gap: { kind: "unit", value: 8, unit: "px" } },
					},
				},
			},
		},
		content: {
			styleRefs: { base: ["sd-card"] },
			hidden: { overrides: { "bp-tablet": true } },
		},
	},
};

const config: Config = {
	components: {
		Hero: {
			fields: { body: { type: "slot" } },
			metadata: {
				anvilkit: {
					editor: {
						version: "2",
						styleTargets: {
							root: {
								label: "Hero",
								responsive: true,
								properties: ["display", "gap", "color"],
							},
							content: {
								label: "Content",
								properties: ["gap", "padding"],
							},
						},
					},
				},
			},
			render: () => null,
		},
		Leaf: {
			fields: {},
			metadata: {
				anvilkit: {
					editor: {
						version: "2",
						styleTargets: {
							root: { label: "Leaf", properties: ["padding"] },
						},
					},
				},
			},
			render: () => null,
		},
		Bare: { fields: {}, render: () => null },
	},
} as unknown as Config;

function docWith(
	nodes: readonly {
		id: string;
		type: string;
		appearance?: unknown;
		slot?: readonly unknown[];
	}[],
): Data {
	return {
		content: nodes.map((node) => ({
			type: node.type,
			props: {
				id: node.id,
				...(node.appearance !== undefined
					? { appearance: node.appearance }
					: {}),
				...(node.slot !== undefined ? { body: node.slot } : {}),
			},
		})),
		root: { props: { designSystem } },
		zones: {},
	} as unknown as Data;
}

const baseDoc = docWith([
	{ id: "hero-1", type: "Hero", appearance: heroAppearance },
]);

describe("target attribute helpers (P1-02)", () => {
	it("emit the escaped, exact attribute pairs", () => {
		expect(anvilRootAttrs("n-1")).toEqual({
			"data-ak-node": "n-1",
			"data-ak-style-node": "n-1",
			"data-ak-style-target": "root",
		});
		expect(anvilTargetAttrs("n-1", "media")).toEqual({
			"data-ak-style-node": "n-1",
			"data-ak-style-target": "media",
		});
	});
});

describe("compileDocumentAppearance (P1-03)", () => {
	it("compiles base + breakpoint layers with target-pair selectors", () => {
		const result = compileDocumentAppearance({ data: baseDoc, config });
		expect(result.css).toContain(
			'[data-ak-style-node="hero-1"][data-ak-style-target="root"] { display: flex; gap: 16px; color: rgba(17, 34, 68, 1); }',
		);
		expect(result.css).toContain("@media (max-width: 1024px)");
		expect(result.css).toContain("gap: 8px;");
		expect(result.styledNodeIds).toEqual(["hero-1"]);
		expect(result.targetManifest).toEqual({ "hero-1": ["content", "root"] });
		expect(result.diagnostics).toHaveLength(0);
	});

	it("resolves styleRefs and hidden through the shared resolvers", () => {
		const result = compileDocumentAppearance({ data: baseDoc, config });
		expect(result.css).toContain(
			'[data-ak-style-node="hero-1"][data-ak-style-target="content"] { gap: 8px; }',
		);
		expect(result.css).toContain("display: none;");
	});

	it("reaches nodes nested in slots via the official traversal", () => {
		const doc = docWith([
			{
				id: "hero-1",
				type: "Hero",
				appearance: heroAppearance,
				slot: [
					{
						type: "Leaf",
						props: {
							id: "leaf-1",
							appearance: {
								version: "1",
								targets: {
									root: {
										style: {
											base: {
												layout: {
													padding: {
														top: { kind: "unit", value: 4, unit: "px" },
													},
												},
											},
										},
									},
								},
							},
						},
					},
				],
			},
		]);
		const result = compileDocumentAppearance({ data: doc, config });
		expect(result.css).toContain(
			'[data-ak-style-node="leaf-1"][data-ak-style-target="root"] { padding-top: 4px; }',
		);
		expect(result.styledNodeIds).toEqual(["hero-1", "leaf-1"]);
	});

	it("flags duplicate node ids as errors", () => {
		const doc = docWith([
			{ id: "dup-1", type: "Hero", appearance: heroAppearance },
			{ id: "dup-1", type: "Leaf" },
		]);
		const result = compileDocumentAppearance({ data: doc, config });
		expect(
			result.diagnostics.some(
				(entry) =>
					entry.severity === "error" && entry.message.includes("duplicate"),
			),
		).toBe(true);
	});

	it("is pure and deterministic — two compiles are byte-identical", () => {
		const one = compileDocumentAppearance({ data: baseDoc, config });
		const two = compileDocumentAppearance({ data: baseDoc, config });
		expect(one.css).toBe(two.css);
		expect(one.fingerprint).toBe(two.fingerprint);
		expect(one.fingerprint).toMatch(/^[0-9a-f]{8}$/);
	});

	it("fingerprint changes when authored content changes", () => {
		const changed = docWith([
			{
				id: "hero-1",
				type: "Hero",
				appearance: {
					...heroAppearance,
					targets: {
						root: {
							style: {
								base: {
									layout: {
										display: "block",
									},
								},
							},
						},
					},
				},
			},
		]);
		expect(
			compileDocumentAppearance({ data: changed, config }).fingerprint,
		).not.toBe(
			compileDocumentAppearance({ data: baseDoc, config }).fingerprint,
		);
	});
});

describe("allowlists and diagnostics (P1-05)", () => {
	it("drops unauthorized properties with a diagnostic", () => {
		const doc = docWith([
			{
				id: "leaf-1",
				type: "Leaf",
				appearance: {
					version: "1",
					targets: {
						root: {
							style: {
								base: {
									layout: {
										display: "flex",
										padding: { top: { kind: "unit", value: 4, unit: "px" } },
									},
								},
							},
						},
					},
				},
			},
		]);
		const result = compileDocumentAppearance({ data: doc, config });
		expect(result.css).toContain("padding-top: 4px;");
		expect(result.css).not.toContain("display: flex");
		const dropped = result.diagnostics.find((entry) =>
			entry.message.includes('property "display"'),
		);
		expect(dropped?.severity).toBe("warning");
	});

	it("borderRadius grants the authored `radius` spec key (shared §6.1 vocabulary, P2-03)", () => {
		const chipConfig: Config = {
			components: {
				Chip: {
					fields: {},
					metadata: {
						anvilkit: {
							editor: {
								version: "2",
								styleTargets: {
									root: { label: "Chip", properties: ["borderRadius"] },
								},
							},
						},
					},
					render: () => null,
				},
			},
		} as unknown as Config;
		const doc = {
			content: [
				{
					type: "Chip",
					props: {
						id: "chip-1",
						appearance: {
							version: "1",
							targets: {
								root: {
									style: {
										base: {
											visual: {
												radius: {
													topLeft: { kind: "unit", value: 8, unit: "px" },
												},
												opacity: 0.5,
											},
										},
									},
								},
							},
						},
					},
				},
			],
			root: { props: {} },
			zones: {},
		} as unknown as Data;
		const result = compileDocumentAppearance({ data: doc, config: chipConfig });
		// The granted vocabulary name admits the differently-spelled spec key…
		expect(result.css).toContain("border-top-left-radius: 8px;");
		// …while an ungranted property still drops, reported under its
		// vocabulary name.
		expect(result.css).not.toContain("opacity");
		expect(
			result.diagnostics.some((entry) =>
				entry.message.includes('property "opacity"'),
			),
		).toBe(true);
	});

	it("rejects undeclared targets and components without metadata v2", () => {
		const doc = docWith([
			{
				id: "bare-1",
				type: "Bare",
				appearance: {
					version: "1",
					targets: { root: { hidden: { base: true } } },
				},
			},
			{
				id: "hero-2",
				type: "Hero",
				appearance: {
					version: "1",
					targets: { media: { hidden: { base: true } } },
				},
			},
		]);
		const result = compileDocumentAppearance({ data: doc, config });
		expect(result.css).toBe("");
		expect(result.styledNodeIds).toEqual([]);
		expect(
			result.diagnostics.some((entry) =>
				entry.message.includes("declares no metadata v2"),
			),
		).toBe(true);
		expect(
			result.diagnostics.some((entry) =>
				entry.message.includes('target "media" is not declared'),
			),
		).toBe(true);
	});

	it("strict mode escalates authorization diagnostics to errors", () => {
		const doc = docWith([
			{
				id: "hero-2",
				type: "Hero",
				appearance: {
					version: "1",
					targets: { media: { hidden: { base: true } } },
				},
			},
		]);
		const strict = compileDocumentAppearance({
			data: doc,
			config,
			strict: true,
		});
		expect(
			strict.diagnostics.every((entry) => entry.severity === "error"),
		).toBe(true);
	});
});

describe("cache transparency (P1-07)", () => {
	it("warm output is byte-identical to cold output", () => {
		const cache = createAppearanceCompilerCache();
		const cold = compileDocumentAppearance({ data: baseDoc, config, cache });
		const warm = compileDocumentAppearance({ data: baseDoc, config, cache });
		const reference = compileDocumentAppearance({ data: baseDoc, config });
		expect(warm.css).toBe(reference.css);
		expect(warm.fingerprint).toBe(cold.fingerprint);
		expect(warm.diagnostics).toEqual(reference.diagnostics);
		expect(warm.targetManifest).toEqual(reference.targetManifest);
	});
});
