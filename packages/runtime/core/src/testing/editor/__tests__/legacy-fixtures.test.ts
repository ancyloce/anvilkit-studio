/**
 * @file PLAN-0025 P0-04 — legacy fixture pack validation.
 *
 * Guards the pack itself: every category the migration must carry is
 * present and schema-valid, the documents are deterministic (build
 * twice, byte-equal), and Puck's own `walkTree` reaches the slot and
 * zone children — so a fixture regression cannot silently hollow out
 * the P0-05 goldens or the later migration suites.
 */

import { migrate, walkTree } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { readAuthoringState } from "../../../editor/index.js";
import {
	buildFullLegacyDocument,
	buildLegacyFixtureConfig,
	buildLegacyFixturePack,
	legacyAuthoringSidecar,
} from "./legacy-fixtures.js";

describe("legacy fixture pack (P0-04)", () => {
	it("is deterministic — building twice is byte-identical", () => {
		expect(JSON.stringify(buildLegacyFixturePack())).toBe(
			JSON.stringify(buildLegacyFixturePack()),
		);
	});

	it("every fixture reads with the expected read-only classification", () => {
		for (const fixture of buildLegacyFixturePack()) {
			const result = readAuthoringState(fixture.data);
			expect(result.readOnly, fixture.name).toBe(fixture.expectReadOnly);
			if (!fixture.expectReadOnly) {
				expect(result.errors, fixture.name).toHaveLength(0);
			}
		}
	});

	it("the full sidecar is schema-valid and covers every category", () => {
		const result = readAuthoringState(buildFullLegacyDocument());
		expect(result.readOnly).toBe(false);
		const state = result.state;
		expect(Object.keys(state.nodes)).toEqual(
			expect.arrayContaining(["hero-1", "card-1", "zone-child-1"]),
		);
		expect(state.breakpoints.length).toBeGreaterThan(0);
		expect(Object.keys(state.tokens).length).toBeGreaterThan(1);
		expect(Object.keys(state.tokenModes).length).toBeGreaterThan(1);
		expect(Object.keys(state.styleDefinitions).length).toBeGreaterThan(0);
		expect(Object.keys(state.componentDefinitions).length).toBeGreaterThan(0);
		expect(Object.keys(state.interactions).length).toBeGreaterThan(0);
		expect(Object.keys(state.bindings).length).toBeGreaterThan(0);
	});

	it("exercises hidden state, styleRefs, token alias, and cross-refs", () => {
		const { state } = readAuthoringState(buildFullLegacyDocument());
		expect(state.nodes["hero-1"]?.hidden?.overrides?.["bp-tablet"]).toBe(true);
		expect(state.nodes["zone-child-1"]?.hidden?.base).toBe(true);
		const refs = state.nodes["card-1"]?.styleRefs?.base ?? [];
		expect(refs).toContain("sd-card");
		for (const ref of refs) {
			expect(state.styleDefinitions[ref]).toBeDefined();
		}
		const alias = state.tokens["tok-space-alias"]?.values.light;
		expect(alias).toEqual({ kind: "alias", tokenId: "tok-space" });
		expect(state.tokens["tok-space"]).toBeDefined();
		const interaction = state.interactions["int-cta"];
		expect(interaction).toBeDefined();
		if (interaction !== undefined) {
			expect(state.nodes[interaction.sourceNodeId]).toBeDefined();
		}
		const binding = state.bindings["bind-title"];
		expect(binding).toBeDefined();
		if (binding !== undefined) {
			expect(state.nodes[binding.nodeId]).toBeDefined();
		}
	});

	it("walkTree reaches content and slots but NOT raw legacy zones", () => {
		const visited: string[] = [];
		walkTree(
			buildFullLegacyDocument(),
			buildLegacyFixtureConfig(),
			(content) => {
				for (const item of content) {
					visited.push(String(item.props.id));
				}
			},
		);
		expect(visited).toContain("hero-1");
		expect(visited).toContain("card-1");
		expect(visited).toContain("slot-child-1");
		// Contract fact (locked here, relied on by plan §10.2 step 1):
		// legacy zones are invisible to walkTree until migrate() runs.
		expect(visited).not.toContain("zone-child-1");
	});

	it("after migrate(), zone children join the tree walkTree sees", () => {
		const config = buildLegacyFixtureConfig();
		const migrated = migrate(buildFullLegacyDocument(), config);
		const visited: string[] = [];
		walkTree(migrated, config, (content) => {
			for (const item of content) {
				visited.push(String(item.props.id));
			}
		});
		expect(visited).toContain("zone-child-1");
	});

	it("no orphan authoring ids once the document is migrated", () => {
		const config = buildLegacyFixtureConfig();
		const migrated = migrate(buildFullLegacyDocument(), config);
		const documentIds = new Set<string>();
		walkTree(migrated, config, (content) => {
			for (const item of content) {
				documentIds.add(String(item.props.id));
			}
		});
		for (const nodeId of Object.keys(legacyAuthoringSidecar.nodes)) {
			expect(documentIds.has(nodeId), `orphan sidecar record ${nodeId}`).toBe(
				true,
			);
		}
	});
});
