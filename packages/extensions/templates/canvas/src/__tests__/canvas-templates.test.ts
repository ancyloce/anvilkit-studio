import {
	CANVAS_IR_VERSION,
	CanvasTemplateDefinitionSchema,
	migrateCanvasIR,
} from "@anvilkit/canvas-core";
import { describe, expect, it } from "vitest";
import {
	type CanvasTemplateCatalogEntry,
	canvasTemplateList,
	canvasTemplates,
} from "../index.js";

describe("@anvilkit/canvas-templates", () => {
	it("ships exactly ten starter templates", () => {
		expect(canvasTemplateList).toHaveLength(10);
		expect(Object.keys(canvasTemplates)).toHaveLength(10);
	});

	it("keys the registry by each template's own id", () => {
		for (const [key, template] of Object.entries(canvasTemplates)) {
			expect(template.id).toBe(key);
		}
	});

	it("has unique ids", () => {
		const ids = canvasTemplateList.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("validates independently as a CanvasTemplateDefinition", () => {
		for (const template of canvasTemplateList) {
			const result = CanvasTemplateDefinitionSchema.safeParse(template);
			expect(
				result.success,
				result.success ? "" : JSON.stringify(result.error?.issues),
			).toBe(true);
		}
	});

	// `document` is already migrated at module-load time (see ../index.ts), so
	// this re-migration is a no-op for a well-formed catalog — but it is the
	// same seam every other persisted document goes through, and it protects
	// against a future template being added without going through it.
	it.each(
		canvasTemplateList.map((t) => [t.id, t] as const),
	)("%s's document migrates and validates as CanvasIR", (_id, template: CanvasTemplateCatalogEntry) => {
		let migrated: ReturnType<typeof migrateCanvasIR>;
		try {
			migrated = migrateCanvasIR(template.document);
		} catch (error) {
			throw new Error(
				`${template.id} failed to migrate/validate: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
		expect(migrated.version).toBe(CANVAS_IR_VERSION);
		// Migration must not drop the document's content.
		expect(migrated.pages.length).toBe(template.document.pages.length);
	});

	it("gives every template a non-empty title, description, category, and tags", () => {
		for (const template of canvasTemplateList) {
			expect(template.title.length).toBeGreaterThan(0);
			expect(template.description.length).toBeGreaterThan(0);
			expect(template.category.length).toBeGreaterThan(0);
			expect(template.tags.length).toBeGreaterThan(0);
		}
	});

	it("wires ig-post and ig-story to their matching FR-060 size preset", () => {
		const igPost = canvasTemplates["ig-post"];
		expect(igPost.supportedSizes.map((preset) => preset.id)).toEqual([
			"instagram-post",
		]);
		expect(igPost.supportedSizes[0]).toMatchObject({
			width: igPost.document.pages[0]?.size.width,
			height: igPost.document.pages[0]?.size.height,
		});

		const igStory = canvasTemplates["ig-story"];
		expect(igStory.supportedSizes.map((preset) => preset.id)).toEqual([
			"instagram-story",
		]);
		expect(igStory.supportedSizes[0]).toMatchObject({
			width: igStory.document.pages[0]?.size.width,
			height: igStory.document.pages[0]?.size.height,
		});
	});

	it("leaves supportedSizes empty for templates with no matching FR-060 preset", () => {
		for (const id of [
			"poster",
			"slide-16x9",
			"slide-title",
			"a4-flyer",
			"business-card",
			"fb-cover",
			"twitter-header",
			"presentation-section",
		] as const) {
			expect(canvasTemplates[id].supportedSizes).toEqual([]);
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
			for (const page of template.document.pages) {
				walk(page.root);
			}
			expect(new Set(ids).size).toBe(ids.length);
		}
	});
});
