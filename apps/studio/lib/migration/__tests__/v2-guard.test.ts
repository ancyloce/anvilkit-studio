/**
 * @file P5-06 — v2 editor document guard (PLAN-0025 §10.4): v2
 * documents pass untouched, legacy documents migrate ON READ (memory
 * only — the sidecar form never reaches the editor), and blocked
 * documents are refused.
 */

import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { guardDocumentForV2Editor } from "../v2-guard";

const ANVILKIT_AUTHORING_KEY = "__anvilkit";

const config = {
	components: {
		Box: {
			fields: {},
			metadata: {
				anvilkit: {
					editor: {
						version: "2",
						styleTargets: {
							root: { label: "Box", properties: ["display"] },
						},
					},
				},
			},
			render: () => null,
		},
	},
} as unknown as Config;

const sidecar = {
	version: "1",
	revision: 1,
	breakpoints: [],
	nodes: {
		"box-1": {
			version: "1",
			name: "Box",
			layout: { base: { display: "flex" } },
		},
	},
	tokens: {},
	tokenModes: {},
	styleDefinitions: {},
	componentDefinitions: {},
	interactions: {},
	bindings: {},
};

describe("guardDocumentForV2Editor (P5-06, §10.4)", () => {
	it("passes a v2 document through untouched", () => {
		const doc = {
			content: [],
			root: { props: {} },
			zones: {},
		} as unknown as Data;
		const result = guardDocumentForV2Editor(doc, config);
		expect(result.kind).toBe("ok");
		if (result.kind === "ok") expect(result.data).toBe(doc);
	});

	it("migrates a legacy document on read — the editor receives v2, never the sidecar", () => {
		const doc = {
			content: [{ type: "Box", props: { id: "box-1" } }],
			root: { props: { [ANVILKIT_AUTHORING_KEY]: sidecar } },
			zones: {},
		} as unknown as Data;
		const result = guardDocumentForV2Editor(doc, config);
		expect(result.kind).toBe("migrated");
		if (result.kind === "migrated") {
			const rootProps = result.data.root.props as Record<string, unknown>;
			expect(rootProps[ANVILKIT_AUTHORING_KEY]).toBeUndefined();
			expect(rootProps.authoringSchemaVersion).toBeUndefined();
			const node = (
				result.data.content[0] as { props: Record<string, unknown> }
			).props;
			expect(node.appearance).toMatchObject({
				targets: { root: { style: { base: { layout: { display: "flex" } } } } },
			});
		}
	});

	it("refuses a document that fails migration", () => {
		const doc = {
			content: [
				{ type: "Box", props: { id: "dup" } },
				{ type: "Box", props: { id: "dup" } },
			],
			root: { props: { [ANVILKIT_AUTHORING_KEY]: sidecar } },
			zones: {},
		} as unknown as Data;
		const result = guardDocumentForV2Editor(doc, config);
		expect(result.kind).toBe("blocked");
		if (result.kind === "blocked") {
			expect(result.diagnostics.length).toBeGreaterThan(0);
		}
	});
});
