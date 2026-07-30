/**
 * Component-package editor adoption regression (REVIEW-0019 P1;
 * PLAN-0020 EP-04/EP-22, §26.2, §32.2).
 *
 * Asserts adoption levels from the packages' **published**
 * `componentConfig` exports — no host-side metadata injection — so
 * §32.2 acceptance rests on component-author adoption, not on the
 * studio scaffold. Mirrors the regression test the adoption guide
 * tells external authors to keep (`editor-adoption.mdx`, "Where am I
 * now?").
 */

import { componentConfig as bentoGridConfig } from "@anvilkit/bento-grid";
import { inspectEditorCapabilities } from "@anvilkit/core/editor";
import { componentConfig as heroConfig } from "@anvilkit/hero";
import { componentConfig as sectionConfig } from "@anvilkit/section";
import { describe, expect, it } from "vitest";

const ADOPTED = {
	Section: sectionConfig,
	Hero: heroConfig,
	BentoGrid: bentoGridConfig,
} as const;

describe("component-package editor adoption (Level ≥ 2 from published config)", () => {
	const report = inspectEditorCapabilities({ components: ADOPTED });

	it.each(Object.keys(ADOPTED))("%s reports Level ≥ 2", (name) => {
		const component = report.components.find(
			(entry) => entry.componentType === name,
		);
		expect(component).toBeDefined();
		expect(component?.level).toBeGreaterThanOrEqual(2);
	});

	it("inline-text adopters reach Level 3", () => {
		for (const name of ["Section", "Hero"]) {
			const component = report.components.find(
				(entry) => entry.componentType === name,
			);
			expect(component?.level).toBeGreaterThanOrEqual(3);
		}
	});

	it("declarations are warning-free", () => {
		for (const component of report.components) {
			expect(component.warnings).toEqual([]);
		}
	});

	it("declares styleTarget root — the render-prop path has real consumers", () => {
		for (const config of Object.values(ADOPTED)) {
			const editor = (
				config.metadata as { editor?: { styleTarget?: string } } | undefined
			)?.editor;
			expect(editor?.styleTarget).toBe("root");
		}
	});
});
