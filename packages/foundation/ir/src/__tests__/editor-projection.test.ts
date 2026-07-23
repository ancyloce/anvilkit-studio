/**
 * `@anvilkit/ir/editor` suite (PLAN-0020 CORE-P0-013): legacy
 * byte-identity, one-way locked projection (DD-DEC-020),
 * used-feature scanning, and export capability validation.
 */

import type { PageIR, PageIRNode } from "@anvilkit/contracts";
import type { AuthoringStateV1 } from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	listUsedAuthoringFeatures,
	projectAuthoringToIR,
	validateExportCapabilities,
} from "../editor/index.js";

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

function makeIR(): PageIR {
	const child: PageIRNode = {
		id: "child-1",
		type: "Text",
		props: { text: "hello" },
	};
	const lockedChild: PageIRNode = {
		id: "child-2",
		type: "Image",
		props: {},
		meta: { owner: "someone" },
	};
	return {
		version: "1",
		root: {
			id: "root",
			type: "root",
			props: {},
			children: [child, lockedChild],
		},
		assets: [],
		metadata: { createdAt: "2026-07-22T00:00:00.000Z" },
	} as unknown as PageIR;
}

describe("projectAuthoringToIR", () => {
	it("returns the input by reference when nothing is locked", () => {
		const ir = makeIR();
		expect(projectAuthoringToIR(ir, emptyAuthoring())).toBe(ir);
		const withState: AuthoringStateV1 = {
			...emptyAuthoring(),
			nodes: { "child-1": { version: "1", name: "Named, not locked" } },
		};
		expect(projectAuthoringToIR(ir, withState)).toBe(ir);
	});

	it("projects locked one-way into meta.locked, preserving other meta", () => {
		const ir = makeIR();
		const authoring: AuthoringStateV1 = {
			...emptyAuthoring(),
			nodes: {
				"child-2": { version: "1", locked: true, name: "Never in IR" },
			},
		};
		const projected = projectAuthoringToIR(ir, authoring);
		expect(projected).not.toBe(ir);
		const [child1, child2] = projected.root.children ?? [];
		expect(child1).toBe(ir.root.children?.[0]);
		expect(child2?.meta).toEqual({ owner: "someone", locked: true });
		expect(JSON.stringify(projected)).not.toContain("Never in IR");
		// The version literal never changes (DD-DEC-004).
		expect(projected.version).toBe("1");
	});

	it("is a no-op for locked ids absent from the tree", () => {
		const ir = makeIR();
		const authoring: AuthoringStateV1 = {
			...emptyAuthoring(),
			nodes: { ghost: { version: "1", locked: true } },
		};
		expect(projectAuthoringToIR(ir, authoring)).toBe(ir);
	});
});

describe("listUsedAuthoringFeatures", () => {
	it("returns nothing for empty authoring state", () => {
		expect(listUsedAuthoringFeatures(emptyAuthoring())).toEqual([]);
	});

	it("detects each sidecar-visible feature", () => {
		const authoring: AuthoringStateV1 = {
			...emptyAuthoring(),
			breakpoints: [
				{ id: "t", label: "T", maxWidth: 991, order: 0, enabled: true },
			],
			tokens: {
				tok: {
					id: "tok",
					path: ["c"],
					name: "C",
					type: "color",
					values: {},
				},
			},
			styleDefinitions: {
				sd: {
					version: "1",
					id: "sd",
					name: "S",
					appliesTo: "any",
					createdAt: "x",
					updatedAt: "x",
				},
			},
			componentDefinitions: {
				cd: {
					version: "1",
					id: "cd",
					name: "Card",
					root: { type: "Card", props: {} },
					exposedProps: [],
					variantAxes: [
						{ id: "a", name: "A", options: [{ id: "o", name: "O" }] },
					],
					variants: [],
					revision: 0,
					createdAt: "x",
					updatedAt: "x",
				},
			},
			interactions: {
				int: {
					version: "1",
					id: "int",
					name: "I",
					sourceNodeId: "n",
					trigger: { type: "click" },
					actions: [],
					enabled: true,
				},
			},
			bindings: {
				b: {
					version: "1",
					id: "b",
					nodeId: "n",
					target: { type: "visibility" },
					expression: { type: "literal", value: true },
				},
			},
		};
		expect(listUsedAuthoringFeatures(authoring)).toEqual([
			"responsive",
			"tokens",
			"styleDefinitions",
			"localComponents",
			"variants",
			"interactions",
			"bindings",
		]);
	});

	it("detects responsive via overrides and components via instances", () => {
		const authoring: AuthoringStateV1 = {
			...emptyAuthoring(),
			nodes: {
				n1: {
					version: "1",
					hidden: { overrides: { mobile: true } },
					componentInstance: {
						definitionId: "gone",
						definitionRevision: 0,
						variantSelection: {},
						propOverrides: {},
						nodeOverrides: {},
					},
				},
			},
		};
		expect(listUsedAuthoringFeatures(authoring)).toEqual([
			"responsive",
			"localComponents",
		]);
	});
});

describe("validateExportCapabilities", () => {
	it("passes when every used feature is declared", () => {
		const result = validateExportCapabilities(["responsive", "tokens"], {
			version: "1",
			supportedFeatures: ["responsive", "tokens", "bindings"],
		});
		expect(result.status).toBe("passed");
		expect(result.errors).toEqual([]);
	});

	it("passes trivially with no used features and no declaration", () => {
		expect(validateExportCapabilities([], undefined).status).toBe("passed");
	});

	it("blocks production export for undeclared formats", () => {
		const result = validateExportCapabilities(["tokens"], undefined);
		expect(result.status).toBe("blocked");
		expect(result.errors[0]?.code).toBe("EDITOR_EXPORTER_UNSUPPORTED");
		expect(result.errors[0]?.severity).toBe("error");
		expect(result.errors[0]?.details?.declared).toBe(false);
	});

	it("blocks production export for partially-supported formats", () => {
		const result = validateExportCapabilities(["responsive", "interactions"], {
			version: "1",
			supportedFeatures: ["responsive"],
		});
		expect(result.status).toBe("blocked");
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.details?.feature).toBe("interactions");
	});

	it("degrades to a warning in development mode", () => {
		const result = validateExportCapabilities(["tokens"], undefined, {
			mode: "development",
		});
		expect(result.status).toBe("warning");
		expect(result.errors[0]?.severity).toBe("warning");
	});
});
