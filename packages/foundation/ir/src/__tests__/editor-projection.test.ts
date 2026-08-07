/**
 * `@anvilkit/ir/editor` suite (PLAN-0020 CORE-P0-013): legacy
 * byte-identity, one-way locked projection (DD-DEC-020),
 * used-feature scanning, and export capability validation.
 */

import type { PageIR, PageIRNode } from "@anvilkit/contracts";

import { describe, expect, it } from "vitest";

/**
 * The sidecar envelope, declared locally for this fixture.
 *
 * `p1-005` moved the sidecar contract out of published
 * `@anvilkit/contracts`. This suite certifies behaviour that still
 * reads the sidecar, so it carries its own structural view until that
 * behaviour is removed.
 */
type AuthoringStateV1 = {
	readonly version: "1";
	readonly revision: number;
	readonly breakpoints: readonly unknown[];
	readonly nodes: Readonly<Record<string, Record<string, unknown>>>;
	readonly tokens: Readonly<Record<string, unknown>>;
	readonly tokenModes: Readonly<Record<string, unknown>>;
	readonly styleDefinitions: Readonly<Record<string, unknown>>;
	readonly componentDefinitions: Readonly<Record<string, unknown>>;
	readonly interactions: Readonly<Record<string, unknown>>;
	readonly bindings: Readonly<Record<string, unknown>>;
};
import {
	type EditorFeatureScanDocument,
	listUsedAuthoringFeatures,
	listUsedEditorFeatures,
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

/**
 * DD-DEC-018 / CORE-P3-009. The gap this closes: `richText` is stored
 * in **component props**, so a sidecar-only scan reported it as unused
 * and a rich-text document could be exported through a format that
 * declares no support for it.
 */
describe("listUsedEditorFeatures (complete scanner)", () => {
	/** `{version:"1",type:"doc",content}` — what the shared sanitizer emits. */
	function tiptap(text: string): Record<string, unknown> {
		return {
			version: "1",
			type: "doc",
			content: [{ type: "paragraph", content: [{ type: "text", text }] }],
		};
	}

	it("is byte-identical to the sidecar-only scan when no document is given", () => {
		expect(listUsedEditorFeatures(emptyAuthoring())).toEqual([]);
		expect(listUsedEditorFeatures(emptyAuthoring(), null)).toEqual([]);
	});

	it("leaves a legacy document (no sidecar, no editor features) untouched", () => {
		const legacy: EditorFeatureScanDocument = {
			root: { props: { title: "Legacy" } },
			content: [{ type: "Heading", props: { id: "h", text: "plain string" } }],
		};
		expect(listUsedEditorFeatures(emptyAuthoring(), legacy)).toEqual([]);
	});

	describe("richText — detected from the document, never hand-declared", () => {
		it("detects a rich-text value in top-level component props", () => {
			const document: EditorFeatureScanDocument = {
				content: [
					{ type: "Prose", props: { id: "p1", body: tiptap("hello") } },
				],
			};
			expect(listUsedEditorFeatures(emptyAuthoring(), document)).toEqual([
				"richText",
			]);
		});

		it("detects rich text nested inside slot content", () => {
			const document: EditorFeatureScanDocument = {
				content: [
					{
						type: "Section",
						props: {
							id: "s1",
							children: [
								{ type: "Prose", props: { id: "p1", body: tiptap("deep") } },
							],
						},
					},
				],
			};
			expect(listUsedEditorFeatures(emptyAuthoring(), document)).toContain(
				"richText",
			);
		});

		it("detects rich text in legacy zones", () => {
			const document: EditorFeatureScanDocument = {
				zones: {
					"n1:content": [
						{ type: "Prose", props: { id: "p1", body: tiptap("zoned") } },
					],
				},
			};
			expect(listUsedEditorFeatures(emptyAuthoring(), document)).toContain(
				"richText",
			);
		});

		it("detects rich text captured inside a component definition root", () => {
			const authoring: AuthoringStateV1 = {
				...emptyAuthoring(),
				componentDefinitions: {
					cd: {
						version: "1",
						id: "cd",
						name: "Quote",
						root: { type: "Prose", props: { body: tiptap("captured") } },
						exposedProps: [],
						variantAxes: [],
						variants: [],
						revision: 0,
						createdAt: "x",
						updatedAt: "x",
					},
				},
			};
			// No document at all: the definition alone is enough.
			expect(listUsedEditorFeatures(authoring)).toEqual([
				"localComponents",
				"richText",
			]);
		});

		it("detects rich text reintroduced by an instance prop override", () => {
			const authoring: AuthoringStateV1 = {
				...emptyAuthoring(),
				nodes: {
					n1: {
						version: "1",
						componentInstance: {
							definitionId: "cd",
							definitionRevision: 0,
							variantSelection: {},
							propOverrides: {
								body: tiptap("overridden") as never,
							},
							nodeOverrides: {},
						},
					},
				},
			};
			expect(listUsedEditorFeatures(authoring)).toContain("richText");
		});

		it("does not match Puck's HTML-string richtext field", () => {
			const document: EditorFeatureScanDocument = {
				content: [
					{ type: "Legacy", props: { id: "l", html: "<p>not tiptap</p>" } },
				],
			};
			expect(listUsedEditorFeatures(emptyAuthoring(), document)).toEqual([]);
		});

		it("does not match a bare ProseMirror doc with no version field", () => {
			const document: EditorFeatureScanDocument = {
				content: [
					{
						type: "Other",
						props: { id: "o", doc: { type: "doc", content: [] } },
					},
				],
			};
			expect(listUsedEditorFeatures(emptyAuthoring(), document)).toEqual([]);
		});

		it("terminates on a self-referential prop graph", () => {
			const cyclic: Record<string, unknown> = { id: "c" };
			cyclic.self = cyclic;
			const document: EditorFeatureScanDocument = {
				content: [{ type: "Cyclic", props: cyclic }],
			};
			expect(listUsedEditorFeatures(emptyAuthoring(), document)).toEqual([]);
		});
	});

	describe("dangling references — a partially-edited document cannot escape", () => {
		it("detects tokens from a live reference with no sidecar definition", () => {
			const authoring: AuthoringStateV1 = {
				...emptyAuthoring(),
				nodes: {
					n1: {
						version: "1",
						style: {
							base: {
								background: { kind: "token", tokenId: "brand" },
							} as never,
						},
					},
				},
			};
			expect(listUsedEditorFeatures(authoring)).toContain("tokens");
		});

		it("detects styleDefinitions from a dangling styleRef", () => {
			const authoring: AuthoringStateV1 = {
				...emptyAuthoring(),
				nodes: { n1: { version: "1", styleRefs: { base: ["gone"] } } },
			};
			expect(listUsedEditorFeatures(authoring)).toContain("styleDefinitions");
		});

		it("detects variants from an instance selection alone", () => {
			const authoring: AuthoringStateV1 = {
				...emptyAuthoring(),
				nodes: {
					n1: {
						version: "1",
						componentInstance: {
							definitionId: "cd",
							definitionRevision: 0,
							variantSelection: { size: "lg" },
							propOverrides: {},
							nodeOverrides: {},
						},
					},
				},
			};
			expect(listUsedEditorFeatures(authoring)).toContain("variants");
		});

		it("detects interactions and bindings from node refs alone", () => {
			const authoring: AuthoringStateV1 = {
				...emptyAuthoring(),
				nodes: {
					n1: { version: "1", interactionRefs: ["i1"], bindingRefs: ["b1"] },
				},
			};
			const used = listUsedEditorFeatures(authoring);
			expect(used).toContain("interactions");
			expect(used).toContain("bindings");
		});

		it("detects tokens from declared modes alone", () => {
			const authoring: AuthoringStateV1 = {
				...emptyAuthoring(),
				tokenModes: { dark: { id: "dark", name: "Dark" } },
			};
			expect(listUsedEditorFeatures(authoring)).toContain("tokens");
		});
	});

	/**
	 * The audit the plan asks for: every `EditorFeatureId` must have a
	 * positive detection path. A new union member with no arm here is a
	 * feature that could silently escape the production export block.
	 */
	it("has positive detection coverage for every EditorFeatureId", () => {
		const cases: Record<
			string,
			{ authoring: AuthoringStateV1; document?: EditorFeatureScanDocument }
		> = {
			responsive: {
				authoring: {
					...emptyAuthoring(),
					breakpoints: [
						{ id: "t", label: "T", maxWidth: 991, order: 0, enabled: true },
					],
				},
			},
			tokens: {
				authoring: {
					...emptyAuthoring(),
					tokens: {
						tok: {
							id: "tok",
							path: ["c"],
							name: "C",
							type: "color",
							values: {},
						},
					},
				},
			},
			styleDefinitions: {
				authoring: {
					...emptyAuthoring(),
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
				},
			},
			localComponents: {
				authoring: {
					...emptyAuthoring(),
					nodes: {
						n1: {
							version: "1",
							componentInstance: {
								definitionId: "cd",
								definitionRevision: 0,
								variantSelection: {},
								propOverrides: {},
								nodeOverrides: {},
							},
						},
					},
				},
			},
			variants: {
				authoring: {
					...emptyAuthoring(),
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
				},
			},
			interactions: {
				authoring: {
					...emptyAuthoring(),
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
				},
			},
			bindings: {
				authoring: {
					...emptyAuthoring(),
					bindings: {
						b: {
							version: "1",
							id: "b",
							nodeId: "n",
							target: { type: "visibility" },
							expression: { type: "literal", value: true },
						},
					},
				},
			},
			richText: {
				authoring: emptyAuthoring(),
				document: {
					content: [{ type: "Prose", props: { id: "p", body: tiptap("x") } }],
				},
			},
		};

		// Every member of the union, taken from the contract's own list.
		const allFeatureIds = [
			"responsive",
			"tokens",
			"styleDefinitions",
			"localComponents",
			"variants",
			"interactions",
			"bindings",
			"richText",
		] as const;

		for (const feature of allFeatureIds) {
			const scenario = cases[feature];
			expect(
				scenario,
				`no positive-detection fixture for "${feature}"`,
			).toBeDefined();
			const used = listUsedEditorFeatures(
				(scenario as NonNullable<typeof scenario>).authoring,
				(scenario as NonNullable<typeof scenario>).document,
			);
			expect(used, `"${feature}" was not detected`).toContain(feature);
		}
		expect(Object.keys(cases).sort()).toEqual([...allFeatureIds].sort());
	});

	/**
	 * The declared/undeclared preflight matrix per feature: an
	 * undeclared format blocks production export of any used feature,
	 * a declaring format passes.
	 */
	it("blocks production export per feature when undeclared, passes when declared", () => {
		const allFeatureIds = [
			"responsive",
			"tokens",
			"styleDefinitions",
			"localComponents",
			"variants",
			"interactions",
			"bindings",
			"richText",
		] as const;
		for (const feature of allFeatureIds) {
			expect(validateExportCapabilities([feature], undefined).status).toBe(
				"blocked",
			);
			expect(
				validateExportCapabilities([feature], {
					version: "1",
					supportedFeatures: [feature],
				}).status,
			).toBe("passed");
			expect(
				validateExportCapabilities([feature], undefined, {
					mode: "development",
				}).status,
			).toBe("warning");
		}
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
