/**
 * @file PLAN-0025 P1-06 — legacy-golden parity for the new compiler.
 *
 * The v2 document is DERIVED from the P0-04 legacy sidecar fixture
 * (same nodes, same values), so fixture and parity input cannot
 * drift. The new compiler's output must be normalized-equivalent to
 * the committed P0-05 export golden: identical declaration sets per
 * (node, layer), with only the selector shape differing by design
 * (v1 `[data-ak-node]` vs v2 target pairs).
 *
 * The known fontSize length-token defect is shared by construction —
 * both pipelines use the same serializer — so parity here includes
 * parity of that diagnostic. The fix-vs-parity decision explicitly
 * moves to Phase 2 with this test as the tripwire.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DesignSystemV1 } from "@anvilkit/contracts/editor";
import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
// The conversion + normalization moved into PRODUCTION code with
// P5-01 (`migrations/puck-native-v2.ts`) — this suite now proves the
// real migration conversion against the committed golden, so test
// and migration can never drift.
import {
	normalizeCssForParity as normalize,
	legacyNodeToAppearance as toAppearance,
} from "../../../migrations/puck-native-v2.js";
import { compileDocumentAppearance } from "../../../style-compiler/index.js";
import { legacyAuthoringSidecar } from "./legacy-fixtures.js";

/** v2 design system derived from the legacy sidecar collections. */
const designSystem: DesignSystemV1 = {
	version: "1",
	breakpoints: legacyAuthoringSidecar.breakpoints,
	tokens: legacyAuthoringSidecar.tokens,
	tokenModes: legacyAuthoringSidecar.tokenModes,
	defaultTokenMode: "light",
	styleDefinitions: legacyAuthoringSidecar.styleDefinitions,
};

const ALL_PROPERTIES = [
	"display",
	"gap",
	"padding",
	"margin",
	"width",
	"background",
	"opacity",
	"color",
	"fontSize",
	"textAlign",
] as const;

const config: Config = {
	components: Object.fromEntries(
		["Hero", "Card", "Zone"].map((type) => [
			type,
			{
				fields: {},
				metadata: {
					anvilkit: {
						editor: {
							version: "2",
							styleTargets: {
								root: {
									label: type,
									responsive: true,
									properties: ALL_PROPERTIES,
								},
							},
						},
					},
				},
				render: () => null,
			},
		]),
	),
} as unknown as Config;

const typeOf: Record<string, string> = {
	"hero-1": "Hero",
	"card-1": "Card",
	"zone-child-1": "Zone",
};

const v2Document = {
	content: Object.entries(legacyAuthoringSidecar.nodes).map(
		([nodeId, record]) => ({
			type: typeOf[nodeId] ?? "Hero",
			props: { id: nodeId, appearance: toAppearance(record) },
		}),
	),
	root: { props: { designSystem } },
	zones: {},
} as unknown as Data;

const goldenPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"__goldens__",
	"legacy-export-light.css",
);

describe("legacy-golden parity (P1-06)", () => {
	it("normalized declarations match the committed legacy export golden", () => {
		const compiled = compileDocumentAppearance({
			data: v2Document,
			config,
			tokenMode: "light",
		});
		const legacy = normalize(readFileSync(goldenPath, "utf8"));
		const modern = normalize(compiled.css);
		expect(modern).toEqual(legacy);
	});

	it("styled nodes and the defect diagnostic match the legacy pipeline", () => {
		const compiled = compileDocumentAppearance({
			data: v2Document,
			config,
			tokenMode: "light",
		});
		expect(compiled.styledNodeIds).toEqual([
			"card-1",
			"hero-1",
			"zone-child-1",
		]);
		expect(compiled.diagnostics).toHaveLength(1);
		expect(compiled.diagnostics[0]?.message).toContain("font-size");
	});

	it("parity input is deterministic (derived, not hand-copied)", () => {
		const one = compileDocumentAppearance({
			data: v2Document,
			config,
			tokenMode: "light",
		});
		const two = compileDocumentAppearance({
			data: v2Document,
			config,
			tokenMode: "light",
		});
		expect(one.fingerprint).toBe(two.fingerprint);
	});
});
