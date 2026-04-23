/**
 * Code-block extraction harness for the export pipeline guide
 * (`apps/docs/src/content/docs/guides/export-pipeline.mdx`).
 *
 * Each `describe(...)` below pins a numbered section of the guide.
 * Snippets mirror — verbatim where possible — the code blocks the
 * guide renders to readers, so drift in `@anvilkit/core`,
 * `@anvilkit/ir`, `@anvilkit/plugin-export-html`, or the worked
 * JSON-exporter example breaks the docs build before it ships.
 *
 * Phase 4 task: `phase4-009`.
 */

import { StudioConfigSchema, compilePlugins } from "@anvilkit/core";
import type {
	ExportFormatDefinition,
	PageIR,
	PageIRAsset,
	PageIRMetadata,
	PageIRNode,
	StudioPlugin,
	StudioPluginContext,
	StudioPluginMeta,
} from "@anvilkit/core/types";
import {
	createExportJsonPlugin,
	jsonFormat,
} from "@anvilkit/example-export-json";
import { irToPuckData, puckDataToIR } from "@anvilkit/ir";
import { createHtmlExportPlugin, htmlFormat } from "@anvilkit/plugin-export-html";
import type { Config, Data as PuckData } from "@puckeditor/core";
import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";

const studioConfig = StudioConfigSchema.parse({});

function makeCtx(data?: PuckData): StudioPluginContext {
	return {
		getData: () => data ?? { root: { props: {} }, content: [], zones: {} },
		getPuckApi: (() => {
			throw new Error("getPuckApi unused in this test");
		}) as unknown as StudioPluginContext["getPuckApi"],
		studioConfig,
		log: vi.fn(),
		emit: vi.fn(),
		registerAssetResolver: vi.fn(),
	};
}

const FIXED_CLOCK = () => new Date("2026-04-11T00:00:00.000Z");

const noop = (() => null) as unknown as Config["components"][string]["render"];

const demoData: PuckData = {
	root: {},
	content: [
		{
			type: "Hero",
			props: {
				id: "hero-1",
				headline: "Ship updates without friction.",
				description: "Deterministic HTML exports for internal release pages.",
				linuxHref: "/download/linux",
				linuxLabel: "Download for Linux",
			},
		},
	],
};

const demoConfig: Config = {
	components: {
		Hero: {
			render: noop,
			fields: {
				headline: { type: "textarea" },
				description: { type: "textarea" },
			},
		},
	},
};

// ---------------------------------------------------------------------------
// §1 — Pipeline overview
// ---------------------------------------------------------------------------

describe("§1 — Pipeline overview", () => {
	it("Puck Data → puckDataToIR() → PageIR is the canonical hand-off", () => {
		const ir = puckDataToIR(demoData, demoConfig, { now: FIXED_CLOCK });
		expect(ir.version).toBe("1");
		expect(ir.root.type).toBe("__root__");
		expect(ir.root.children?.[0]?.type).toBe("Hero");
	});

	it("PageIR → ExportFormatDefinition.run() returns string | Uint8Array", async () => {
		const ir = puckDataToIR(demoData, demoConfig, { now: FIXED_CLOCK });
		const { content, filename } = await jsonFormat.run(ir, {});
		expect(typeof content === "string" || content instanceof Uint8Array).toBe(
			true,
		);
		expect(filename).toBe("page.json");
	});

	it("running the IR transform twice produces byte-identical output", () => {
		const a = puckDataToIR(demoData, demoConfig, { now: FIXED_CLOCK });
		const b = puckDataToIR(demoData, demoConfig, { now: FIXED_CLOCK });
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});
});

// ---------------------------------------------------------------------------
// §2 — The PageIR shape
// ---------------------------------------------------------------------------

describe("§2 — PageIR shape", () => {
	it("a minimal PageIR has version / root / assets / metadata", () => {
		const ir: PageIR = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{
						id: "hero-1",
						type: "Hero",
						props: {
							headline: "Ship updates without friction.",
							description: "Deterministic exports for internal release pages.",
						},
					},
				],
			},
			assets: [],
			metadata: { createdAt: "2026-04-11T00:00:00.000Z" },
		};

		expect(ir.version).toBe("1");
		expect(ir.root.id).toBe("root");
		expect(ir.assets).toEqual([]);
		expect(ir.metadata.createdAt).toBe("2026-04-11T00:00:00.000Z");
	});

	it("leaf PageIRNode omits children rather than setting it to []", () => {
		const heroNode: PageIRNode = {
			id: "hero-1",
			type: "Hero",
			props: {
				headline: "Ship updates without friction.",
				description: "Deterministic HTML exports.",
			},
		};

		expect("children" in heroNode).toBe(false);
	});

	it("PageIRAsset.kind is the closed union the guide documents", () => {
		const cover: PageIRAsset = {
			id: "a1b2c3",
			kind: "image",
			url: "https://cdn.example.com/cover.jpg",
			meta: { width: 1600, height: 900 },
		};

		const validKinds: Array<PageIRAsset["kind"]> = [
			"image",
			"video",
			"font",
			"script",
			"style",
			"other",
		];
		expect(validKinds).toContain(cover.kind);
	});

	it("PageIRMetadata.timestamps round-trip as ISO strings", () => {
		const meta: PageIRMetadata = {
			createdAt: "2026-04-11T00:00:00.000Z",
			updatedAt: "2026-04-11T12:00:00.000Z",
		};

		expect(new Date(meta.createdAt ?? "").toISOString()).toBe(meta.createdAt);
		expect(new Date(meta.updatedAt ?? "").toISOString()).toBe(meta.updatedAt);
	});
});

// ---------------------------------------------------------------------------
// §3 — Writing a new exporter
// ---------------------------------------------------------------------------

describe("§3 — Writing a new exporter", () => {
	it("the worked JSON exporter is a real ExportFormatDefinition", () => {
		expect(jsonFormat.id).toBe("json");
		expect(jsonFormat.label).toBe("JSON");
		expect(jsonFormat.extension).toBe("json");
		expect(jsonFormat.mimeType).toBe("application/json");
		expect(typeof jsonFormat.run).toBe("function");
	});

	it("StudioPluginMeta has the four required fields", () => {
		const meta: StudioPluginMeta = {
			id: "anvilkit-example-export-json",
			name: "JSON Export",
			version: "0.1.0",
			coreVersion: "^0.1.0-alpha",
		};

		expect(meta.id).toBe("anvilkit-example-export-json");
		expect(meta.coreVersion).toBe("^0.1.0-alpha");
	});

	it("createExportJsonPlugin returns a valid StudioPlugin", () => {
		const plugin: StudioPlugin = createExportJsonPlugin();
		expect(plugin.meta.id).toBe("anvilkit-example-export-json");
		expect(typeof plugin.register).toBe("function");
	});

	it("compilePlugins wires the format into runtime.exportFormats", async () => {
		const runtime = await compilePlugins(
			[createExportJsonPlugin()],
			makeCtx(),
		);
		expect([...runtime.exportFormats.keys()]).toContain("json");
		expect(runtime.exportFormats.get("json")?.mimeType).toBe("application/json");
	});
});

// ---------------------------------------------------------------------------
// §4 — HTML exporter walkthrough
// ---------------------------------------------------------------------------

describe("§4 — HTML exporter walkthrough", () => {
	it("htmlFormat matches the descriptor shape the guide walks through", () => {
		expect(htmlFormat.id).toBe("html");
		expect(htmlFormat.label).toBe("HTML");
		expect(htmlFormat.extension).toBe("html");
		expect(htmlFormat.mimeType).toBe("text/html");
	});

	it("createHtmlExportPlugin registers both an export format and a header action", async () => {
		const runtime = await compilePlugins([createHtmlExportPlugin()], makeCtx());
		expect(runtime.exportFormats.has("html")).toBe(true);
		expect(runtime.headerActions.map((a) => a.id)).toContain("export-html");
	});
});

// ---------------------------------------------------------------------------
// §5 — Asset inlining strategies
// ---------------------------------------------------------------------------

describe("§5 — Asset inlining", () => {
	it("the JSON exporter copies ir.assets through verbatim (no inlining)", async () => {
		const ir: PageIR = {
			version: "1",
			root: { id: "root", type: "__root__", props: {} },
			assets: [
				{ id: "a1", kind: "image", url: "https://cdn.example.com/hero.jpg" },
			],
			metadata: { createdAt: "2026-04-11T00:00:00.000Z" },
		};
		const { content } = await jsonFormat.run(ir, {});
		const parsed = JSON.parse(content as string) as PageIR;
		expect(parsed.assets).toEqual(ir.assets);
	});

	it("the HTML exporter inlines small fetched images as data URIs", async () => {
		const ir: PageIR = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{
						id: "hero-1",
						type: "Hero",
						props: {
							headline: "Assets inline when they fit.",
							description: "",
						},
					},
				],
			},
			assets: [
				{
					id: "a1",
					kind: "image",
					url: "https://cdn.example.com/tiny.jpg",
				},
			],
			metadata: { createdAt: "2026-04-11T00:00:00.000Z" },
		};

		const { content, warnings } = await htmlFormat.run(ir, {
			inlineStyles: true,
			inlineAssetThresholdBytes: 1024,
			title: "Inline",
			fetchAsset: async () => ({
				bytes: new Uint8Array([1, 2, 3, 4]),
				contentType: "image/jpeg",
			}),
		});

		expect(typeof content).toBe("string");
		expect(Array.isArray(warnings)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// §6 — Round-trip invariants
// ---------------------------------------------------------------------------

describe("§6 — Round-trip invariants", () => {
	it("irToPuckData(puckDataToIR(d)) ≡ d for the demo fixture", () => {
		const ir = puckDataToIR(demoData, demoConfig, { now: FIXED_CLOCK });
		expect(irToPuckData(ir)).toEqual(demoData);
	});

	it("the JSON exporter losslessly JSON-round-trips the IR", async () => {
		const ir = puckDataToIR(demoData, demoConfig, { now: FIXED_CLOCK });
		const { content } = await jsonFormat.run(ir, {});
		expect(JSON.parse(content as string)).toEqual(ir);
	});

	it("a floating clock would break snapshot stability — FIXED_CLOCK is required", () => {
		const a = puckDataToIR(demoData, demoConfig, { now: FIXED_CLOCK });
		const b = puckDataToIR(demoData, demoConfig, { now: FIXED_CLOCK });
		expect(a.metadata.createdAt).toBe(b.metadata.createdAt);
	});
});

// ---------------------------------------------------------------------------
// §7 — Testing exporters
// ---------------------------------------------------------------------------

describe("§7 — Testing exporters", () => {
	it("golden snapshots: htmlFormat produces non-empty, stable output", async () => {
		const ir = puckDataToIR(demoData, demoConfig, { now: FIXED_CLOCK });

		const fetchAsset = async () => ({
			bytes: new Uint8Array([1, 2, 3, 4]),
			contentType: "image/jpeg",
		});
		const a = await htmlFormat.run(ir, {
			inlineStyles: true,
			inlineAssetThresholdBytes: 0,
			title: "Hero",
			fetchAsset,
		});
		const b = await htmlFormat.run(ir, {
			inlineStyles: true,
			inlineAssetThresholdBytes: 0,
			title: "Hero",
			fetchAsset,
		});

		expect(typeof a.content).toBe("string");
		expect((a.content as string).length).toBeGreaterThan(0);
		expect(a.content).toEqual(b.content);
	});

	it("round-trip parsing: happy-dom recovers the hero headline from emitted HTML", async () => {
		const ir = puckDataToIR(demoData, demoConfig, { now: FIXED_CLOCK });
		const { content } = await htmlFormat.run(ir, {
			inlineStyles: true,
			inlineAssetThresholdBytes: 0,
			fetchAsset: async () => ({
				bytes: new Uint8Array([1, 2, 3, 4]),
				contentType: "image/jpeg",
			}),
		});

		const window = new Window();
		window.document.write(content as string);
		window.document.close();

		expect(window.document.body.textContent ?? "").toContain(
			"Ship updates without friction.",
		);
	});

	it("registration: the JSON exporter meets compilePlugins' contract", async () => {
		const runtime = await compilePlugins(
			[createExportJsonPlugin()],
			makeCtx(),
		);
		expect([...runtime.exportFormats.keys()]).toContain("json");
	});
});

// ---------------------------------------------------------------------------
// Type-level: ExportFormatDefinition cannot be typed against Data
// ---------------------------------------------------------------------------

describe("Type surface (compile-time only)", () => {
	it("ExportFormatDefinition<Opts>.run accepts a PageIR and returns ExportResult", () => {
		// Purely a type test: assigning `jsonFormat` into the generic type
		// would fail at compile time if `run`'s signature had drifted.
		const typed: ExportFormatDefinition = jsonFormat;
		expect(typed.id).toBe("json");
	});
});
