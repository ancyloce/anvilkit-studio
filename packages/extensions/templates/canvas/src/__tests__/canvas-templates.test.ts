import type { CanvasIR, CanvasNode } from "@anvilkit/canvas-core";
import {
	CANVAS_IR_VERSION,
	CANVAS_SIZE_PRESETS,
	CanvasTemplateDefinitionSchema,
	findSizePreset,
	migrateCanvasIR,
	validateCanvasIRInvariants,
} from "@anvilkit/canvas-core";
import { describe, expect, it } from "vitest";
import {
	CANVAS_TEMPLATE_TAG_AXES,
	CANVAS_TEMPLATE_TAGS,
	type CanvasTemplateCatalogEntry,
	canvasTemplateList,
	canvasTemplates,
} from "../index.js";

/** The catalog size cp3-007 grew this package to. */
const CATALOG_SIZE = 40;

/** Templates per size preset (cp3-007's "no preset over-weighted" criterion). */
const TEMPLATES_PER_PRESET = 3;

/** Every node in a document, in pre-order. */
function everyNode(ir: CanvasIR): CanvasNode[] {
	const out: CanvasNode[] = [];
	const walk = (node: CanvasNode): void => {
		out.push(node);
		if ("children" in node) for (const child of node.children) walk(child);
	};
	for (const page of ir.pages) walk(page.root);
	return out;
}

describe("@anvilkit/canvas-templates", () => {
	it("ships the full starter catalog", () => {
		expect(canvasTemplateList).toHaveLength(CATALOG_SIZE);
		expect(Object.keys(canvasTemplates)).toHaveLength(CATALOG_SIZE);
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
		// The print and presentation sizes. `CANVAS_SIZE_PRESETS` is deliberately
		// social-only (cp0-003's verdict), so every one of these is correctly
		// preset-less rather than wired to a near-miss social format.
		for (const id of [
			"poster",
			"slide-16x9",
			"slide-title",
			"a4-flyer",
			"business-card",
			"fb-cover",
			"twitter-header",
			"presentation-section",
			"a4-menu",
			"a4-certificate",
			"postcard-a6",
			"business-card-dark",
			"slide-agenda",
			"slide-quote",
			"slide-stats",
			"slide-thank-you",
		] as const) {
			expect(canvasTemplates[id].supportedSizes).toEqual([]);
		}
	});

	// cp0-003 regression guards. Preset ids are referenced in exactly one
	// place — the `sizePresets(...)` call sites in ../index.ts (no template
	// JSON carries a preset id) — and `sizePresets` used to `filter` the
	// catalog, so an id that matched nothing vanished without a trace.
	it("resolves every size preset id the catalog references", () => {
		for (const template of canvasTemplateList) {
			for (const preset of template.supportedSizes) {
				// Identity, not just existence: a `supportedSizes` entry must BE
				// the catalog's own entry, never a hand-copied literal that can
				// drift from it.
				expect(findSizePreset(preset.id)).toEqual(preset);
			}
		}
	});

	it("declares a size preset for every template whose page matches one", () => {
		for (const template of canvasTemplateList) {
			const page = template.document.pages[0]?.size;
			expect(page).toBeDefined();
			if (!page) continue;
			const matching = CANVAS_SIZE_PRESETS.filter(
				(preset) =>
					preset.unit === page.unit &&
					preset.width === page.width &&
					preset.height === page.height,
			);
			// A template sized exactly like a shipped preset must say so; one
			// with no matching preset must declare nothing rather than guess.
			// Which of several same-size presets it names is left open on
			// purpose (1080×1920 matches three).
			expect(
				template.supportedSizes.length > 0,
				`${template.id} (${page.width}×${page.height}${page.unit}) matches [${matching
					.map((preset) => preset.id)
					.join(", ")}]`,
			).toBe(matching.length > 0);
		}
	});

	// cp3-007 catalog-growth rails. The schema check above answers "is this
	// shaped like a CanvasIR"; none of it answers "will this open, and will it
	// render what it says". These do.
	describe("catalog growth (cp3-007)", () => {
		// `CanvasTemplateDefinitionSchema` validates SHAPE. Whole-document facts —
		// unique node ids across pages, no dangling `assetId`, a group page root,
		// a frame clip shape this build can actually honour, a declared capability
		// for any Auto Layout intent — need the O(document) pass. A template that
		// fails one of these parses cleanly and then misbehaves in the editor,
		// which is precisely the failure mode a catalog of 40 hides.
		it.each(
			canvasTemplateList.map((t) => [t.id, t] as const),
		)("%s satisfies validateCanvasIRInvariants", (_id, template: CanvasTemplateCatalogEntry) => {
			const issues = validateCanvasIRInvariants(template.document);
			expect(issues.map((issue) => `${issue.code}: ${issue.message}`)).toEqual(
				[],
			);
		});

		it("gives every FR-060 size preset the same number of templates", () => {
			const counts = new Map(
				CANVAS_SIZE_PRESETS.map((preset) => [preset.id, 0] as const),
			);
			for (const template of canvasTemplateList) {
				for (const preset of template.supportedSizes) {
					counts.set(preset.id, (counts.get(preset.id) ?? 0) + 1);
				}
			}
			// Both halves of cp3-007's criterion in one assertion: no preset
			// unrepresented (a zero here), and none over-weighted (an outlier).
			// Stated as an exact map rather than a `>= 1` loop so rebalancing the
			// catalog is a deliberate edit to this file, not a silent drift.
			expect(Object.fromEntries(counts)).toEqual(
				Object.fromEntries(
					CANVAS_SIZE_PRESETS.map((preset) => [
						preset.id,
						TEMPLATES_PER_PRESET,
					]),
				),
			);
		});

		// Capability floor. Animation is metadata-only and is never played or
		// exported (cp0-001); video and audio are contract-only — video renders a
		// static poster at best and audio renders nothing. A template built on any
		// of them looks finished in the JSON and blank on the canvas.
		it("uses no node kind or field this build does not render", () => {
			for (const template of canvasTemplateList) {
				for (const node of everyNode(template.document)) {
					expect(
						node.type,
						`${template.id}/${node.id} uses an unrendered node kind`,
					).not.toBe("video");
					expect(node.type).not.toBe("audio");
					expect(node.type).not.toBe("ai-placeholder");
					expect(
						node.meta?.animation,
						`${template.id}/${node.id} carries animation metadata that is never played`,
					).toBeUndefined();
				}
				for (const page of template.document.pages) {
					expect(
						page.animation,
						`${template.id} page animation`,
					).toBeUndefined();
					// Only `solid` has first-class rendering; `image`/`gradient` page
					// backgrounds fall back to white on the stage AND warn
					// `BACKGROUND_UNSUPPORTED` on export. A gradient belongs on a
					// full-bleed rect, which every renderer paints.
					expect(page.background.kind, `${template.id} page background`).toBe(
						"solid",
					);
				}
			}
		});

		// Bundling a raster means bundling a licence claim. No shipped template
		// carries one: image wells are EMPTY frame placeholders, which the editor
		// draws as an "add an image" affordance and the exporter leaves as the
		// frame's fallback fill. Nothing to attribute, nothing to get wrong.
		it("bundles no imagery and references no asset", () => {
			for (const template of canvasTemplateList) {
				expect(template.document.assets, `${template.id} assets`).toEqual({});
				for (const node of everyNode(template.document)) {
					if (node.type === "frame" && node.placeholder) {
						expect(
							node.placeholder.assetId,
							`${template.id}/${node.id} placeholder is filled`,
						).toBeUndefined();
					}
					expect(node.type, `${template.id}/${node.id}`).not.toBe("image");
					expect(node.type).not.toBe("svg");
				}
			}
		});

		// A family outside this list opens in a fallback face, which defeats the
		// point of shipping a designed template. The list is the intersection of
		// cp2-002's default catalog
		// (`canvas-editor/src/text/default-font-catalog.ts`) with what a host
		// actually LOADS: nothing in the editor injects a catalog family's
		// stylesheet for a document font — only the font picker's own preview
		// does — so a template's face has to be one the host already has. Widen
		// this only alongside a real font-loading seam.
		const TEMPLATE_FONT_FAMILIES = new Set(["Inter"]);

		it("draws every font family from the loadable catalog subset", () => {
			for (const template of canvasTemplateList) {
				for (const node of everyNode(template.document)) {
					if (node.type !== "text") continue;
					expect(
						typeof node.fontFamily === "string" ? node.fontFamily : "<token>",
						`${template.id}/${node.id}`,
					).toSatisfy((family: string) => TEMPLATE_FONT_FAMILIES.has(family));
				}
			}
		});

		// Every layout aid a template declares must be a real one for its size:
		// a safe area that is not the preset's own is worse than none, because it
		// is drawn on the canvas as guidance.
		it("mirrors the preset's own safe area wherever it declares one", () => {
			for (const template of canvasTemplateList) {
				for (const page of template.document.pages) {
					const safeArea = page.layoutAids?.safeArea;
					if (!safeArea) continue;
					const presets = template.supportedSizes.filter(
						(preset) => preset.safeArea !== undefined,
					);
					expect(
						presets.length,
						`${template.id} declares a safe area but no preset defines one`,
					).toBeGreaterThan(0);
					expect(
						presets.map((preset) => preset.safeArea),
						`${template.id} safe area does not match its preset`,
					).toContainEqual(safeArea);
				}
			}
		});

		it("keeps every node inside its page, and every page at a positive size", () => {
			for (const template of canvasTemplateList) {
				for (const page of template.document.pages) {
					expect(page.size.width).toBeGreaterThan(0);
					expect(page.size.height).toBeGreaterThan(0);
					for (const node of page.root.children) {
						const { x, y } = node.transform;
						expect(
							x >= 0 && y >= 0,
							`${template.id}/${node.id} starts off-page at ${x},${y}`,
						).toBe(true);
						expect(
							x + node.bounds.width <= page.size.width + 0.001,
							`${template.id}/${node.id} overflows the page width`,
						).toBe(true);
						expect(
							y + node.bounds.height <= page.size.height + 0.001,
							`${template.id}/${node.id} overflows the page height`,
						).toBe(true);
					}
				}
			}
		});
	});

	// cp3-006 tag-vocabulary rails. `cp3-007` grew this catalog to 40
	// templates; these five assertions are what keep 40 templates' tags a
	// usable facet set instead of 40 private opinions. See the doc comment on
	// CANVAS_TEMPLATE_TAG_AXES for the reasoning behind each rule.
	describe("tag vocabulary (cp3-006)", () => {
		it("draws every template tag from the controlled vocabulary", () => {
			const vocabulary = new Set(CANVAS_TEMPLATE_TAGS);
			for (const template of canvasTemplateList) {
				const unknown = template.tags.filter((tag) => !vocabulary.has(tag));
				expect(unknown, `${template.id} uses non-vocabulary tag(s)`).toEqual(
					[],
				);
			}
		});

		it("uses every vocabulary tag on at least one template", () => {
			const used = new Set(canvasTemplateList.flatMap((t) => t.tags));
			const unused = CANVAS_TEMPLATE_TAGS.filter((tag) => !used.has(tag));
			// An unused tag is a picker entry that matches nothing — the exact
			// dead end this vocabulary exists to prevent. Add the tag with the
			// template that needs it, not before.
			expect(unused).toEqual([]);
		});

		it("gives every template at least one format tag and one orientation tag", () => {
			const formats = new Set<string>(CANVAS_TEMPLATE_TAG_AXES.format);
			const orientations = new Set<string>(
				CANVAS_TEMPLATE_TAG_AXES.orientation,
			);
			for (const template of canvasTemplateList) {
				expect(
					template.tags.some((tag) => formats.has(tag)),
					`${template.id} has no format tag`,
				).toBe(true);
				expect(
					template.tags.some((tag) => orientations.has(tag)),
					`${template.id} has no orientation tag`,
				).toBe(true);
			}
		});

		it("keeps tags lowercase kebab-case, deduplicated, and at least three deep", () => {
			for (const template of canvasTemplateList) {
				expect(
					new Set(template.tags).size,
					`${template.id} repeats a tag`,
				).toBe(template.tags.length);
				// Three is the point where a tag set stops being a restatement of
				// the title and starts describing the template along more than one
				// axis — the difference between "poster" and "portrait event
				// announcement".
				expect(
					template.tags.length,
					`${template.id} is under-tagged`,
				).toBeGreaterThanOrEqual(3);
				for (const tag of template.tags) {
					expect(tag, `${template.id} tag "${tag}"`).toMatch(
						/^[a-z0-9]+(-[a-z0-9]+)*$/,
					);
				}
			}
		});

		it("keeps the flattened vocabulary sorted and free of cross-axis duplicates", () => {
			const flat = Object.values(CANVAS_TEMPLATE_TAG_AXES).flat();
			expect(new Set(flat).size, "a tag appears on two axes").toBe(flat.length);
			expect([...CANVAS_TEMPLATE_TAGS]).toEqual(
				[...CANVAS_TEMPLATE_TAGS].sort(),
			);
		});
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
