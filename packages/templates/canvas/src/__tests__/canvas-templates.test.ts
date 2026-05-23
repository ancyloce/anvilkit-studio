import { CanvasIRSchema } from "@anvilkit/canvas-core";
import { describe, expect, it } from "vitest";
import {
	type CanvasTemplate,
	canvasTemplateList,
	canvasTemplates,
} from "../index.js";

describe("@anvilkit/canvas-templates", () => {
	it("ships exactly ten starter templates", () => {
		expect(canvasTemplateList).toHaveLength(10);
		expect(Object.keys(canvasTemplates)).toHaveLength(10);
	});

	it("keys the registry by each template's own slug", () => {
		for (const [key, template] of Object.entries(canvasTemplates)) {
			expect(template.slug).toBe(key);
		}
	});

	it("has unique slugs", () => {
		const slugs = canvasTemplateList.map((t) => t.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});

	it.each(
		canvasTemplateList.map((t) => [t.slug, t] as const),
	)("%s is a valid CanvasIR", (_slug, template: CanvasTemplate) => {
		const result = CanvasIRSchema.safeParse(template.ir);
		if (!result.success) {
			throw new Error(
				`${template.slug} failed CanvasIRSchema: ${JSON.stringify(
					result.error.issues,
					null,
					2,
				)}`,
			);
		}
		expect(result.success).toBe(true);
	});

	it("gives every template a non-empty name and description", () => {
		for (const template of canvasTemplateList) {
			expect(template.name.length).toBeGreaterThan(0);
			expect(template.description.length).toBeGreaterThan(0);
		}
	});

	it("uses unique node ids within each template", () => {
		for (const template of canvasTemplateList) {
			const ids: string[] = [];
			const walk = (node: { id: string; children?: unknown[] }): void => {
				ids.push(node.id);
				if (Array.isArray(node.children)) {
					for (const child of node.children) {
						walk(child as { id: string; children?: unknown[] });
					}
				}
			};
			for (const page of template.ir.pages) {
				walk(page.root);
			}
			expect(new Set(ids).size).toBe(ids.length);
		}
	});
});
