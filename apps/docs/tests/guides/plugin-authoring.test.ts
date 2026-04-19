/**
 * Code-block extraction harness for the plugin authoring guide
 * (`apps/docs/src/content/docs/guides/plugin-authoring.mdx`).
 *
 * Each `describe(...)` block below corresponds to one numbered
 * section of the guide, and the snippets inside mirror — verbatim
 * where possible — the code blocks rendered to readers. Keeping the
 * one-to-one mapping is what guarantees CI catches drift the moment
 * the contract moves underneath the docs.
 *
 * Phase 4 task: `phase4-006`.
 */

import {
	StudioConfigSchema,
	StudioPluginError,
	compilePlugins,
} from "@anvilkit/core";
import {
	createUsageCounterPlugin,
} from "@anvilkit/example-usage-counter";
import type {
	ExportFormatDefinition,
	StudioHeaderAction,
	StudioPlugin,
	StudioPluginContext,
	StudioPluginMeta,
} from "@anvilkit/core/types";
import type { Data as PuckData, PuckApi } from "@puckeditor/core";
import { describe, expect, it, vi } from "vitest";

const studioConfig = StudioConfigSchema.parse({});

function makeCtx(
	data: PuckData = { root: { props: {} }, content: [], zones: {} },
	puckApi?: PuckApi,
): StudioPluginContext {
	return {
		getData: () => data,
		getPuckApi: (() => {
			if (!puckApi) {
				throw new Error("getPuckApi unused in this test");
			}
			return puckApi;
		}) as StudioPluginContext["getPuckApi"],
		studioConfig,
		log: vi.fn(),
		emit: vi.fn(),
	};
}

// ---------------------------------------------------------------------------
// §2 — Minimum viable plugin
// ---------------------------------------------------------------------------

describe("§2 — Minimum viable plugin", () => {
	function createNoopPlugin(): StudioPlugin {
		const meta = {
			id: "com.example.noop",
			name: "No-op",
			version: "1.0.0",
			coreVersion: "^0.1.0-alpha",
		} as const;

		return {
			meta,
			register(_ctx) {
				return { meta };
			},
		};
	}

	it("compiles through compilePlugins with no contributions", async () => {
		const ctx = makeCtx();
		const runtime = await compilePlugins([createNoopPlugin()], ctx);

		expect(runtime.pluginMeta.map((m) => m.id)).toEqual([
			"com.example.noop",
		]);
		expect(runtime.exportFormats.size).toBe(0);
		expect(runtime.headerActions).toHaveLength(0);
		expect(runtime.overrides).toHaveLength(0);
	});

	it("rejects an incompatible coreVersion", async () => {
		const incompatible: StudioPlugin = {
			meta: {
				id: "com.example.too-new",
				name: "Too new",
				version: "1.0.0",
				coreVersion: "^99.0.0",
			},
			register(_ctx) {
				return { meta: incompatible.meta };
			},
		};

		await expect(compilePlugins([incompatible], makeCtx())).rejects.toThrow(
			StudioPluginError,
		);
	});
});

// ---------------------------------------------------------------------------
// §3 — The StudioPluginContext
// ---------------------------------------------------------------------------

describe("§3 — StudioPluginContext", () => {
	const observerPlugin: StudioPlugin = {
		meta: {
			id: "com.example.observer",
			name: "Observer",
			version: "1.0.0",
			coreVersion: "^0.1.0-alpha",
		},
		register(ctx: StudioPluginContext) {
			ctx.log("info", "observer plugin registered", {
				theme: ctx.studioConfig.theme.defaultMode,
			});
			return { meta: observerPlugin.meta };
		},
	};

	it("receives studioConfig + log on register()", async () => {
		const ctx = makeCtx();
		await compilePlugins([observerPlugin], ctx);

		expect(ctx.log).toHaveBeenCalledWith(
			"info",
			"observer plugin registered",
			expect.objectContaining({ theme: expect.any(String) }),
		);
	});
});

// ---------------------------------------------------------------------------
// §4 — Lifecycle hooks
// ---------------------------------------------------------------------------

describe("§4 — Lifecycle hooks", () => {
	const requireHeroPlugin: StudioPlugin = {
		meta: {
			id: "com.example.require-hero",
			name: "Require Hero",
			version: "1.0.0",
			coreVersion: "^0.1.0-alpha",
		},
		register(_ctx) {
			return {
				meta: requireHeroPlugin.meta,
				hooks: {
					onBeforePublish(_ctx, data) {
						const hasHero = data.content.some(
							(item) => item.type === "Hero",
						);
						if (!hasHero) {
							throw new StudioPluginError(
								"com.example.require-hero",
								"Pages must include a Hero block before publish",
							);
						}
					},
				},
			};
		},
	};

	it("aborts onBeforePublish when no Hero is present", async () => {
		const ctx = makeCtx();
		const runtime = await compilePlugins([requireHeroPlugin], ctx);
		const data: PuckData = {
			root: { props: {} },
			content: [{ type: "Button", props: { id: "btn-1" } }],
			zones: {},
		};

		await expect(
			runtime.lifecycle.emit("onBeforePublish", ctx, data),
		).rejects.toThrow(/Hero block/);
	});

	it("allows onBeforePublish when a Hero is present", async () => {
		const ctx = makeCtx();
		const runtime = await compilePlugins([requireHeroPlugin], ctx);
		const data: PuckData = {
			root: { props: {} },
			content: [{ type: "Hero", props: { id: "hero-1" } }],
			zones: {},
		};

		await expect(
			runtime.lifecycle.emit("onBeforePublish", ctx, data),
		).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// §5 — Contributing export formats
// ---------------------------------------------------------------------------

describe("§5 — Contributing export formats", () => {
	const jsonFormat: ExportFormatDefinition = {
		id: "json-snapshot",
		label: "JSON snapshot",
		extension: "json",
		mimeType: "application/json",
		async run(ir, _options) {
			return {
				content: JSON.stringify(ir, null, 2),
				filename: "page.json",
				warnings: [],
			};
		},
	};

	function createJsonSnapshotPlugin(): StudioPlugin {
		const meta = {
			id: "com.example.json-snapshot",
			name: "JSON Snapshot Exporter",
			version: "1.0.0",
			coreVersion: "^0.1.0-alpha",
		} as const;

		return {
			meta,
			register(_ctx) {
				return { meta, exportFormats: [jsonFormat] };
			},
		};
	}

	it("registers a unique export format id", async () => {
		const runtime = await compilePlugins(
			[createJsonSnapshotPlugin()],
			makeCtx(),
		);

		expect(runtime.exportFormats.has("json-snapshot")).toBe(true);
		expect(runtime.exportFormats.get("json-snapshot")?.label).toBe(
			"JSON snapshot",
		);
	});

	it("produces JSON content from a normalized IR", async () => {
		const result = await jsonFormat.run(
			{
				version: "1",
				root: { id: "root", type: "__root__", props: {} },
				assets: [],
				metadata: {},
			},
			{},
		);

		expect(result.filename).toBe("page.json");
		expect(typeof result.content).toBe("string");
		const parsed = JSON.parse(result.content as string);
		expect(parsed).toMatchObject({ version: "1" });
	});

	it("rejects two plugins registering the same format id", async () => {
		await expect(
			compilePlugins(
				[createJsonSnapshotPlugin(), createJsonSnapshotPlugin()],
				makeCtx(),
			),
		).rejects.toThrow(StudioPluginError);
	});
});

// ---------------------------------------------------------------------------
// §6 — Dispatching editor actions
// ---------------------------------------------------------------------------

describe("§6 — Dispatching editor actions", () => {
	function clearPage(ctx: StudioPluginContext): void {
		ctx.getPuckApi().dispatch({
			type: "setData",
			data: { root: { props: {} }, content: [], zones: {} },
		});
	}

	function insertHero(ctx: StudioPluginContext): void {
		ctx.getPuckApi().dispatch({
			type: "insert",
			componentType: "Hero",
			destinationZone: "default-zone",
			destinationIndex: 0,
		});
	}

	it("Pattern A — setData replaces the whole tree", () => {
		const dispatch = vi.fn();
		const ctx = makeCtx(undefined, { dispatch } as unknown as PuckApi);

		clearPage(ctx);

		expect(dispatch).toHaveBeenCalledWith({
			type: "setData",
			data: { root: { props: {} }, content: [], zones: {} },
		});
	});

	it("Pattern B — surgical insert preserves history", () => {
		const dispatch = vi.fn();
		const ctx = makeCtx(undefined, { dispatch } as unknown as PuckApi);

		insertHero(ctx);

		expect(dispatch).toHaveBeenCalledWith({
			type: "insert",
			componentType: "Hero",
			destinationZone: "default-zone",
			destinationIndex: 0,
		});
	});
});

// ---------------------------------------------------------------------------
// §7 — Testing plugins (verbatim from the guide)
// ---------------------------------------------------------------------------

describe("§7 — Testing harness pattern", () => {
	const samplePlugin: StudioPlugin = {
		meta: {
			id: "com.example.sample",
			name: "Sample",
			version: "1.0.0",
			coreVersion: "^0.1.0-alpha",
		},
		register(_ctx) {
			return {
				meta: samplePlugin.meta,
				hooks: {
					onInit(ctx) {
						ctx.log("info", "sample plugin started");
					},
				},
			};
		},
	};

	it("logs an info line on onInit", async () => {
		const ctx = makeCtx();
		const runtime = await compilePlugins([samplePlugin], ctx);

		await runtime.lifecycle.emit("onInit", ctx);

		expect(ctx.log).toHaveBeenCalledWith("info", "sample plugin started");
	});
});

// ---------------------------------------------------------------------------
// §8 — Worked example
// ---------------------------------------------------------------------------

describe("§8 — Worked example: usage-counter", () => {
	it("exposes the documented plugin meta", () => {
		const plugin = createUsageCounterPlugin();
		expect(plugin.meta).toEqual(
			expect.objectContaining({
				id: "anvilkit-example-usage-counter",
				name: "Component Usage Counter",
				coreVersion: "^0.1.0-alpha",
			} satisfies Partial<StudioPluginMeta>),
		);
	});

	it("compiles, contributes a header action, and tracks counts", async () => {
		const plugin = createUsageCounterPlugin();
		const data: PuckData = {
			root: { props: {} },
			content: [
				{ type: "Hero", props: { id: "hero-1" } },
				{ type: "Button", props: { id: "btn-1" } },
				{ type: "Button", props: { id: "btn-2" } },
			],
			zones: {
				"footer:children": [{ type: "Button", props: { id: "btn-3" } }],
			},
		};
		const ctx = makeCtx(data);
		const runtime = await compilePlugins([plugin], ctx);

		await runtime.lifecycle.emit("onInit", ctx);
		await runtime.lifecycle.emit("onDataChange", ctx, data);

		expect(plugin.getCounts()).toEqual({ Hero: 1, Button: 3 });
		expect(runtime.headerActions).toHaveLength(1);
		const action = runtime.headerActions[0] as StudioHeaderAction;
		expect(action.id).toBe("usage-counter-log");
	});

	it("emits 'usage-counter:update' through the event bus", async () => {
		const plugin = createUsageCounterPlugin();
		const ctx = makeCtx();
		const runtime = await compilePlugins([plugin], ctx);

		await runtime.lifecycle.emit("onInit", ctx);

		expect(ctx.emit).toHaveBeenCalledWith("usage-counter:update", {});
	});

	it("supports synchronous subscribe / unsubscribe", async () => {
		const plugin = createUsageCounterPlugin();
		const observed: Array<Record<string, number>> = [];
		const unsubscribe = plugin.subscribe((counts) => {
			observed.push({ ...counts });
		});

		const data: PuckData = {
			root: { props: {} },
			content: [{ type: "Hero", props: { id: "hero-1" } }],
			zones: {},
		};
		const ctx = makeCtx(data);
		const runtime = await compilePlugins([plugin], ctx);
		await runtime.lifecycle.emit("onInit", ctx);

		unsubscribe();
		await runtime.lifecycle.emit("onDataChange", ctx, data);

		expect(observed).toEqual([{ Hero: 1 }]);
	});
});
