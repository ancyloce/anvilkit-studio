/**
 * PLAN-0036 P1-11 / FR-031 — catalog + prompt assembly (DOC-02 §6).
 *
 * Two acceptance criteria drive this file: the catalog must regenerate
 * from the Config alone (no hand-maintained component list anywhere), and
 * prompt assembly must be deterministic enough to snapshot.
 */
import { describe, expect, it } from "vitest";
import { componentEditorConfig } from "../editor-config";
import {
	buildCatalog,
	buildPromptBundle,
	renderCatalog,
	renderSystemPrompt,
	whitelistOf,
} from "../generation/catalog";

describe("buildCatalog", () => {
	it("derives the whitelist from the Config alone", () => {
		// The registered component set is the ONLY source — if this ever
		// diverges, something has started hand-maintaining a list.
		expect([...whitelistOf(componentEditorConfig)].sort()).toEqual(
			Object.keys(componentEditorConfig.components).sort(),
		);
	});

	it("covers all 18 wrappers", () => {
		expect(whitelistOf(componentEditorConfig)).toHaveLength(18);
	});

	it("is deterministic and name-sorted", () => {
		const names = buildCatalog(componentEditorConfig).availableComponents.map(
			(component) => component.componentName,
		);
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
		expect(JSON.stringify(buildCatalog(componentEditorConfig))).toBe(
			JSON.stringify(buildCatalog(componentEditorConfig)),
		);
	});
});

describe("renderCatalog (DOC-02 §6.2)", () => {
	const text = renderCatalog(componentEditorConfig);

	it("renders one block per component, in catalog order", () => {
		const headings = [...text.matchAll(/^### (\w+)/gm)].map((m) => m[1]);
		expect(headings).toEqual(whitelistOf(componentEditorConfig));
	});

	it("renders select options as the exact authored vocabulary", () => {
		// Badge's variant is the 6-value cva union derived by the codegen.
		expect(text).toContain(
			"variant (select: default | secondary | destructive | outline | ghost | link)",
		);
	});

	it("renders slot fields on a `slots:` line, not as props", () => {
		const card = text
			.split("\n\n")
			.find((block) => block.startsWith("### Card"));
		expect(card).toBeDefined();
		expect(card).toContain("slots: content, footer");
		expect(card).not.toMatch(/fields:.*\bcontent\b/);
	});

	it("omits every carrier and styling passthrough (rule R6)", () => {
		for (const banned of [
			"appearance",
			"interactions",
			"bindings",
			"animation",
			"classNames",
		]) {
			expect(text).not.toContain(`${banned} (`);
		}
	});

	it("renders array item shapes inline", () => {
		// Select's `options` array carries {label, value} items.
		expect(text).toMatch(
			/options \(array, items: \{ label \(text\), value \(text\) \}\)/,
		);
	});
});

describe("buildPromptBundle (DOC-02 §6.1–6.4)", () => {
	it("is byte-identical for the same config and options", () => {
		const a = buildPromptBundle({
			config: componentEditorConfig,
			kind: "page",
		});
		const b = buildPromptBundle({
			config: componentEditorConfig,
			kind: "page",
		});
		expect(renderSystemPrompt(a)).toBe(renderSystemPrompt(b));
	});

	it("carries all four system blocks in §6 order", () => {
		const bundle = buildPromptBundle({
			config: componentEditorConfig,
			kind: "outline",
		});
		const prompt = renderSystemPrompt(bundle);
		expect(prompt.indexOf(bundle.system.role)).toBe(0);
		expect(prompt.indexOf(bundle.system.catalog)).toBeGreaterThan(0);
		expect(prompt.indexOf(bundle.system.rules)).toBeGreaterThan(
			prompt.indexOf(bundle.system.catalog),
		);
		expect(prompt.indexOf(bundle.system.outputContract)).toBeGreaterThan(
			prompt.indexOf(bundle.system.rules),
		);
	});

	it("uses a distinct role per run kind", () => {
		const roles = (["outline", "section", "page", "refine"] as const).map(
			(kind) =>
				buildPromptBundle({ config: componentEditorConfig, kind }).system.role,
		);
		expect(new Set(roles).size).toBe(4);
	});

	it("pins the canonical rules block verbatim (DOC-02 §6.3)", () => {
		// Written out rather than snapshotted: this text is normative in
		// DOC-02, so a change here should be a deliberate, reviewable diff
		// against the document, not a snapshot refresh.
		const { system } = buildPromptBundle({
			config: componentEditorConfig,
			kind: "page",
		});
		expect(system.rules).toBe(
			[
				"Rules:",
				"R1. Use ONLY the component types listed in the catalog. Any other type is rejected.",
				"R2. Use ONLY the listed fields per component, with values matching the listed type;",
				"    for select fields use ONLY the listed option values, verbatim.",
				'R3. NEVER emit "id" or "akId" — identifiers are assigned by the editor.',
				'R4. Slot content is expressed as "children" arrays; when a component lists more than',
				'    one slot, each child carries "slot": "<slotName>" from the listed slot names.',
				"R5. Nesting depth must not exceed 16 levels.",
				'R6. Do not emit fields named "appearance", "interactions", "bindings" or "animation".',
				"    Styling is expressed ONLY through the listed variant/size/option fields.",
				"R7. Content language: match the user's brief.",
				"R8. Emit exactly ONE JSON object matching the provided schema — no prose, no code",
				"    fences, no comments, no trailing text.",
			].join("\n"),
		);
	});

	it("steers content language through R7 when a locale is given", () => {
		const { system } = buildPromptBundle({
			config: componentEditorConfig,
			kind: "page",
			locale: "ja-JP",
		});
		expect(system.rules).toContain("R7. Content language: ja-JP.");
	});

	it("appends run-specific rules after the canonical block", () => {
		const { system } = buildPromptBundle({
			config: componentEditorConfig,
			kind: "section",
			extraRules: ["Return ONLY this section's nodes."],
		});
		expect(system.rules.endsWith("Return ONLY this section's nodes.")).toBe(
			true,
		);
		expect(system.rules).toContain("R8.");
	});

	it("embeds the SAME gate schema the code editor validates with (FR-C13)", () => {
		const bundle = buildPromptBundle({
			config: componentEditorConfig,
			kind: "page",
		});
		expect(bundle.system.outputContract).toContain(
			"Your entire reply must be a single JSON object valid against this schema.",
		);
		// The embedded schema must be the serialized `jsonSchema`, verbatim.
		expect(bundle.system.outputContract).toContain(
			JSON.stringify(bundle.jsonSchema, null, "\t"),
		);
	});

	it("carries the structured catalog for providers with native schema modes", () => {
		const bundle = buildPromptBundle({
			config: componentEditorConfig,
			kind: "page",
		});
		expect(bundle.catalogData.availableComponents).toHaveLength(18);
	});
});
