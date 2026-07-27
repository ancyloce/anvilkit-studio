/**
 * @file PLAN-0020 CORE-P4-006 — `inspectEditorCapabilities`
 * (DD-0019 §26.2 adoption levels 0–4).
 *
 * The report's whole value is telling an author what to do next, so the
 * tests assert the *advice*, not just the level number: a report that
 * says "Level 1" without saying how to reach Level 2 has not solved the
 * problem it exists for.
 */

import type { EditorCapabilityMetadata } from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	EDITOR_ADOPTION_LEVEL_NAMES,
	formatEditorCapabilityReport,
	inspectEditorCapabilities,
} from "../inspect-capabilities.js";

function configOf(
	components: Record<string, { metadata?: { editor?: unknown } }>,
): unknown {
	return { components };
}

function meta(
	overrides: Partial<EditorCapabilityMetadata> & {
		capabilities?: EditorCapabilityMetadata["capabilities"];
	} = {},
): EditorCapabilityMetadata {
	return {
		version: "1",
		styleTarget: "root",
		capabilities: {},
		...overrides,
	} as EditorCapabilityMetadata;
}

const LEVEL_2 = meta({ capabilities: { visualStyle: true } });
const LEVEL_3 = meta({
	capabilities: {
		visualStyle: true,
		inlineText: [{ id: "text", propPath: "text", format: "plain" }],
	},
});
const LEVEL_4 = meta({
	capabilities: {
		visualStyle: true,
		layoutContainer: true,
		interactions: true,
		inlineText: [{ id: "text", propPath: "text", format: "plain" }],
	},
	slotMap: { content: { reorder: true } },
});

describe("adoption levels (§26.2)", () => {
	it("Level 0 — a component with no declaration at all", () => {
		const report = inspectEditorCapabilities(configOf({ Legacy: {} }));
		expect(report.components[0]?.level).toBe(0);
		expect(report.components[0]?.declared).toEqual([]);
	});

	it('Level 0 — styleTarget "none" is the author opting out, not an oversight', () => {
		const report = inspectEditorCapabilities(
			configOf({
				Opted: { metadata: { editor: meta({ styleTarget: "none" }) } },
			}),
		);
		expect(report.components[0]?.level).toBe(0);
		expect(report.components[0]?.missingForNextLevel[0]).toMatch(/styleTarget/);
	});

	it("Level 1 — declared and selectable, but nothing styleable yet", () => {
		const report = inspectEditorCapabilities(
			configOf({ Selectable: { metadata: { editor: meta() } } }),
		);
		expect(report.components[0]?.level).toBe(1);
	});

	it("Level 2 — a style capability is declared", () => {
		const report = inspectEditorCapabilities(
			configOf({ Styleable: { metadata: { editor: LEVEL_2 } } }),
		);
		expect(report.components[0]?.level).toBe(2);
		expect(report.components[0]?.declared).toContain("visualStyle");
	});

	it("Level 3 — an explicit inline target is declared", () => {
		const report = inspectEditorCapabilities(
			configOf({ Editable: { metadata: { editor: LEVEL_3 } } }),
		);
		expect(report.components[0]?.level).toBe(3);
		expect(report.components[0]?.declared).toContain("inlineText[1]");
	});

	it("Level 3 — an image target alone also qualifies", () => {
		const report = inspectEditorCapabilities(
			configOf({
				Img: {
					metadata: {
						editor: meta({
							capabilities: {
								visualStyle: true,
								imageAdjust: [
									{ id: "m", srcPropPath: "src", altPropPath: "alt" },
								],
							},
						}),
					},
				},
			}),
		);
		expect(report.components[0]?.level).toBe(3);
	});

	it("Level 4 — slot map AND interaction targets", () => {
		const report = inspectEditorCapabilities(
			configOf({ Composable: { metadata: { editor: LEVEL_4 } } }),
		);
		expect(report.components[0]?.level).toBe(4);
		expect(report.components[0]?.missingForNextLevel).toEqual([]);
	});

	it("names exactly the missing half when only one Level 4 requirement is met", () => {
		const report = inspectEditorCapabilities(
			configOf({
				Partial: {
					metadata: {
						editor: meta({
							capabilities: {
								visualStyle: true,
								layoutContainer: true,
								inlineText: [{ id: "t", propPath: "t", format: "plain" }],
							},
							slotMap: { content: {} },
						}),
					},
				},
			}),
		);
		expect(report.components[0]?.level).toBe(3);
		expect(report.components[0]?.missingForNextLevel).toEqual([
			"capabilities.interactions: true",
		]);
	});
});

describe("actionable next steps", () => {
	it("tells a Level 0 component exactly what to add", () => {
		const report = inspectEditorCapabilities(configOf({ Legacy: {} }));
		expect(report.components[0]?.missingForNextLevel.join(" ")).toContain(
			'metadata.editor = { version: "1", styleTarget: "root"',
		);
	});

	it("tells a Level 1 component which capability flags qualify", () => {
		const report = inspectEditorCapabilities(
			configOf({ Selectable: { metadata: { editor: meta() } } }),
		);
		expect(report.components[0]?.missingForNextLevel[0]).toContain(
			"visualStyle",
		);
	});
});

describe("warnings — declarations that parse but cannot work", () => {
	it("distinguishes a malformed declaration from no declaration", () => {
		// These look identical downstream (both read as `undefined`) but
		// need opposite fixes: one author forgot to declare, the other
		// declared something the reader silently threw away.
		const report = inspectEditorCapabilities(
			configOf({ Broken: { metadata: { editor: { version: "2" } } } }),
		);
		expect(report.components[0]?.level).toBe(0);
		expect(report.components[0]?.warnings.join(" ")).toContain(
			"not a valid v1 declaration",
		);
	});

	it("stays silent when there is genuinely no declaration", () => {
		const report = inspectEditorCapabilities(configOf({ Legacy: {} }));
		expect(report.components[0]?.warnings).toEqual([]);
	});

	it("does not cry 'malformed' at a real component's package metadata", () => {
		// Every shipped component package sets `metadata` for its OWN
		// purposes (componentName, packageName, schemaVersion…) with no
		// `editor` key — verified against `@anvilkit/hero`'s config. A
		// warning here would fire for all ~12 packages and train authors
		// to ignore the report.
		const report = inspectEditorCapabilities(
			configOf({
				Hero: {
					metadata: {
						componentName: "Hero",
						componentSlug: "hero",
						packageName: "@anvilkit/hero",
						schemaVersion: 1,
					},
				} as never,
			}),
		);
		expect(report.components[0]?.level).toBe(0);
		expect(report.components[0]?.warnings).toEqual([]);
	});

	it("flags responsive declared with nothing responsive to change", () => {
		const report = inspectEditorCapabilities(
			configOf({
				Odd: {
					metadata: { editor: meta({ capabilities: { responsive: true } }) },
				},
			}),
		);
		expect(report.components[0]?.warnings.join(" ")).toContain(
			"nothing for a breakpoint override to change",
		);
	});

	it("flags an image target with no altPropPath", () => {
		// Without it the a11y rules cannot detect OR fix missing alt text
		// for this component — a silent hole in the accessibility panel.
		const report = inspectEditorCapabilities(
			configOf({
				Img: {
					metadata: {
						editor: meta({
							capabilities: {
								visualStyle: true,
								imageAdjust: [{ id: "m", srcPropPath: "src" }],
							},
						}),
					},
				},
			}),
		);
		expect(report.components[0]?.warnings.join(" ")).toContain("altPropPath");
	});

	it("flags a slot map on a component that is not a layout container", () => {
		const report = inspectEditorCapabilities(
			configOf({
				Slotted: {
					metadata: {
						editor: meta({
							capabilities: { visualStyle: true },
							slotMap: { content: {} },
						}),
					},
				},
			}),
		);
		expect(report.components[0]?.warnings.join(" ")).toContain(
			"layoutContainer",
		);
	});
});

describe("whole-config reporting", () => {
	it("counts components by level and sorts them by type", () => {
		const report = inspectEditorCapabilities(
			configOf({
				Zeta: { metadata: { editor: LEVEL_2 } },
				Alpha: {},
				Mid: { metadata: { editor: LEVEL_3 } },
			}),
		);
		expect(report.components.map((c) => c.componentType)).toEqual([
			"Alpha",
			"Mid",
			"Zeta",
		]);
		expect(report.countsByLevel).toEqual({ 0: 1, 1: 0, 2: 1, 3: 1, 4: 0 });
	});

	it("tolerates a config with no components", () => {
		expect(inspectEditorCapabilities({}).components).toEqual([]);
		expect(inspectEditorCapabilities(undefined).components).toEqual([]);
	});

	it("formats a readable report naming each level", () => {
		const text = formatEditorCapabilityReport(
			inspectEditorCapabilities(
				configOf({ Card: { metadata: { editor: LEVEL_2 } } }),
			),
		);
		expect(text).toContain("Card — Level 2 (Styleable)");
		expect(text).toContain("to reach Level 3:");
		expect(text).toContain("L2 Styleable: 1");
	});

	it("says so plainly when a config has nothing to report", () => {
		expect(
			formatEditorCapabilityReport(inspectEditorCapabilities({})),
		).toContain("no components found");
	});

	it("keeps the §26.2 level names verbatim", () => {
		expect(EDITOR_ADOPTION_LEVEL_NAMES).toEqual({
			0: "Legacy",
			1: "Selectable",
			2: "Styleable",
			3: "Inline editable",
			4: "Composable",
		});
	});
});
