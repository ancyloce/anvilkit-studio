import { CANVAS_IR_VERSION, migrateCanvasIR } from "@anvilkit/canvas-core";
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

	// Committed template JSON is *persisted* IR, so it is decoded the way every
	// other persisted document is: through the migration seam. canvas-core's
	// policy is "migrate-on-read, write current" — a bare `CanvasIRSchema.parse`
	// pins the CURRENT version literal and would reject a stored older template
	// that is perfectly loadable. The assertion is therefore: every template
	// forward-migrates to the current version and validates there.
	it.each(
		canvasTemplateList.map((t) => [t.slug, t] as const),
	)("%s migrates and validates as CanvasIR", (_slug, template: CanvasTemplate) => {
		let migrated: ReturnType<typeof migrateCanvasIR>;
		try {
			migrated = migrateCanvasIR(template.ir);
		} catch (error) {
			throw new Error(
				`${template.slug} failed to migrate/validate: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
		expect(migrated.version).toBe(CANVAS_IR_VERSION);
		// Migration must not drop the document's content.
		expect(migrated.pages.length).toBe(template.ir.pages.length);
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
