/**
 * `buildExportAuthoring` suite (PLAN-0020 CORE-P2-012 / EP-17;
 * REVIEW-0019 P0): the shared exporter-side authoring consumer —
 * sidecar read from IR root props, legacy short-circuit, stylesheet
 * channel, instance materialization and failure degradation.
 * Emission specifics are covered by `export-stylesheet.test.ts` and
 * each exporter's certification suite.
 */

import type { PageIR } from "@anvilkit/contracts";
import type { AuthoringStateV1 } from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import { buildExportAuthoring } from "../index.js";

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

function makeIR(authoring?: AuthoringStateV1): PageIR {
	return {
		version: "1",
		root: {
			id: "root",
			type: "__root__",
			props: authoring === undefined ? {} : { __anvilkit: authoring },
			children: [{ id: "hero-1", type: "Hero", props: {} }],
		},
		assets: [],
		metadata: { createdAt: "2026-01-01T00:00:00.000Z" },
	};
}

describe("buildExportAuthoring", () => {
	it("returns undefined for documents without authoring content", () => {
		expect(buildExportAuthoring(makeIR())).toBeUndefined();
		expect(buildExportAuthoring(makeIR(emptyAuthoring()))).toBeUndefined();
	});

	it("materializes styles for authored nodes", () => {
		const result = buildExportAuthoring(
			makeIR({
				...emptyAuthoring(),
				nodes: {
					"hero-1": {
						version: "1",
						layout: { base: { display: "flex" } },
					},
				},
			}),
		);
		expect(result).toBeDefined();
		expect(result?.css).toBe('[data-ak-node="hero-1"] { display: flex; }');
		expect([...(result?.styledNodeIds ?? [])]).toEqual(["hero-1"]);
		expect(result?.warnings).toEqual([]);
		expect(result?.instances.size).toBe(0);
	});

	it("materializes component instances with runtime ids", () => {
		const result = buildExportAuthoring(
			makeIR({
				...emptyAuthoring(),
				componentDefinitions: {
					def: {
						version: "1",
						id: "def",
						name: "Card",
						root: {
							type: "Section",
							props: { id: "secRoot", headline: "Base" },
						},
						exposedProps: [
							{
								id: "headline",
								name: "Headline",
								type: "text",
								sourcePath: ["headline"],
							},
						],
						variantAxes: [],
						variants: [],
						revision: 1,
						createdAt: "2026-01-01T00:00:00.000Z",
						updatedAt: "2026-01-01T00:00:00.000Z",
					},
				},
				nodes: {
					"hero-1": {
						version: "1",
						componentInstance: {
							definitionId: "def",
							definitionRevision: 1,
							variantSelection: {},
							propOverrides: { headline: "Overridden" },
							nodeOverrides: {
								secRoot: { style: { base: { opacity: 0.5 } } },
							},
						},
					},
				},
			}),
		);
		const replacement = result?.instances.get("hero-1");
		expect(replacement?.type).toBe("Section");
		expect(replacement?.id).toBe("hero-1::secRoot");
		expect(replacement?.props.headline).toBe("Overridden");
		expect(result?.css).toContain(
			'[data-ak-node="hero-1::secRoot"] { opacity: 0.5; }',
		);
	});

	it("degrades an unresolvable instance to a warning", () => {
		const result = buildExportAuthoring(
			makeIR({
				...emptyAuthoring(),
				componentDefinitions: {
					other: {
						version: "1",
						id: "other",
						name: "Other",
						root: { type: "Box", props: { id: "n" } },
						exposedProps: [],
						variantAxes: [],
						variants: [],
						revision: 1,
						createdAt: "2026-01-01T00:00:00.000Z",
						updatedAt: "2026-01-01T00:00:00.000Z",
					},
				},
				nodes: {
					"hero-1": {
						version: "1",
						componentInstance: {
							definitionId: "ghost",
							definitionRevision: 1,
							variantSelection: {},
							propOverrides: {},
							nodeOverrides: {},
						},
					},
				},
			}),
		);
		expect(result?.instances.size).toBe(0);
		expect(
			result?.warnings.some(
				(warning) => warning.code === "EDITOR_DEFINITION_UNAVAILABLE",
			),
		).toBe(true);
	});
});
