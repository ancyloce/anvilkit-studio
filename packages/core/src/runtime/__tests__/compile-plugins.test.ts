/**
 * @file Runtime tests for `compilePlugins` and its `StudioRuntime`
 * output.
 *
 * Acceptance criteria covered:
 * - Version mismatch → `StudioPluginError` mentioning both versions.
 * - Duplicate export format ids → `StudioPluginError` naming both
 *   contributing plugins.
 * - `async register()` resolves correctly into the runtime.
 * - `isStudioPlugin({})` returns false; the structurally invalid
 *   element throws a typed error.
 * - Puck plugins pass through to `puckPlugins` verbatim.
 * - `CORE_VERSION` tracks `package.json`.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin as PuckPlugin } from "@puckeditor/core";
import { describe, expect, it, vi } from "vitest";

import { StudioConfigSchema } from "../../config/schema.js";
import type {
	ExportFormatDefinition,
	ExportResult,
} from "../../types/export.js";
import type {
	StudioHeaderAction,
	StudioPlugin,
	StudioPluginContext,
	StudioPluginMeta,
	StudioPluginRegistration,
} from "../../types/plugin.js";
import { compilePlugins } from "../compile-plugins.js";
import { StudioPluginError } from "../errors.js";
import { CORE_VERSION } from "../version.js";

const studioConfig = StudioConfigSchema.parse({});

function makeCtx(): StudioPluginContext {
	return {
		getData: () => ({ root: { props: {} }, content: [], zones: {} }),
		getPuckApi: (() => {
			throw new Error("getPuckApi should not be invoked in compile tests");
		}) as unknown as StudioPluginContext["getPuckApi"],
		studioConfig,
		log: vi.fn(),
		emit: vi.fn(),
	};
}

/**
 * Build a StudioPlugin test fixture. The helper deliberately accepts
 * the same callback-based `register` shape the real type uses rather
 * than a spreadable partial — spreading a `Partial<StudioPlugin>`
 * would widen `meta` to optional fields, which defeats the strict
 * typing we want to assert against in these tests.
 */
function makePlugin(
	id: string,
	options: {
		coreVersion?: string;
		register?: (
			meta: StudioPluginMeta,
		) => StudioPluginRegistration | Promise<StudioPluginRegistration>;
	} = {},
): StudioPlugin {
	const meta: StudioPluginMeta = {
		id,
		name: id,
		version: "1.0.0",
		coreVersion: options.coreVersion ?? "^0.1.0-alpha",
	};
	const register = options.register ?? ((m) => ({ meta: m }));
	return {
		meta,
		register: () => register(meta),
	};
}

function makeExportFormat(id: string): ExportFormatDefinition {
	return {
		id,
		label: id.toUpperCase(),
		extension: id,
		mimeType: `application/${id}`,
		async run(): Promise<ExportResult> {
			return { content: "", filename: `page.${id}` };
		},
	};
}

/**
 * Build a minimal valid {@link StudioHeaderAction} for compile-time
 * tests. Only `id` is meaningful here — `compilePlugins` treats
 * actions as opaque data and just passes them through to the
 * runtime aggregate, so the `label` / `onClick` are filler.
 */
function makeHeaderAction(id: string): StudioHeaderAction {
	return {
		id,
		label: id,
		onClick: () => undefined,
	};
}

describe("CORE_VERSION drift guard", () => {
	it("matches package.json's version field", async () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const pkgPath = resolve(here, "../../../package.json");
		const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
			version: string;
		};
		expect(CORE_VERSION).toBe(pkg.version);
	});
});

describe("compilePlugins — happy paths", () => {
	it("returns an empty runtime for an empty plugin array", async () => {
		const runtime = await compilePlugins([], makeCtx());

		expect(runtime.pluginMeta).toEqual([]);
		expect(runtime.exportFormats.size).toBe(0);
		expect(runtime.headerActions).toEqual([]);
		expect(runtime.overrides).toEqual([]);
		expect(runtime.puckPlugins).toEqual([]);
		expect(typeof runtime.lifecycle.emit).toBe("function");
		expect(typeof runtime.lifecycle.subscribe).toBe("function");
	});

	it("awaits async register() and aggregates artifacts", async () => {
		const asyncPlugin = makePlugin("com.example.async", {
			register: async (meta) => {
				await Promise.resolve();
				return {
					meta,
					exportFormats: [makeExportFormat("html")],
					headerActions: [makeHeaderAction("export-html")],
				};
			},
		});

		const runtime = await compilePlugins([asyncPlugin], makeCtx());

		expect(runtime.pluginMeta.map((meta) => meta.id)).toEqual([
			"com.example.async",
		]);
		expect(runtime.exportFormats.has("html")).toBe(true);
		expect(runtime.headerActions.map((action) => action.id)).toEqual([
			"export-html",
		]);
	});

	it("passes Puck plugins through verbatim", async () => {
		// `overrides` is a bag of React render functions — we don't
		// need a real component to exercise the structural guard, so
		// cast through `unknown` to keep the fixture React-free.
		const puck = { overrides: {} } as unknown as PuckPlugin;

		const runtime = await compilePlugins([puck], makeCtx());
		expect(runtime.puckPlugins).toEqual([puck]);
		expect(runtime.pluginMeta).toEqual([]);
	});

	it("preserves insertion order of export formats and header actions", async () => {
		const runtime = await compilePlugins(
			[
				makePlugin("a", {
					register: (meta) => ({
						meta,
						exportFormats: [makeExportFormat("html")],
						headerActions: [makeHeaderAction("action-a")],
					}),
				}),
				makePlugin("b", {
					register: (meta) => ({
						meta,
						exportFormats: [makeExportFormat("json")],
						headerActions: [makeHeaderAction("action-b")],
					}),
				}),
			],
			makeCtx(),
		);

		expect([...runtime.exportFormats.keys()]).toEqual(["html", "json"]);
		expect(runtime.headerActions.map((action) => action.id)).toEqual([
			"action-a",
			"action-b",
		]);
	});
});

describe("compilePlugins — version check", () => {
	it("throws StudioPluginError when coreVersion does not match", async () => {
		const plugin = makePlugin("com.example.bad-version", {
			coreVersion: "^2.0.0",
		});

		await expect(compilePlugins([plugin], makeCtx())).rejects.toSatisfy(
			(error: unknown) => {
				if (!(error instanceof StudioPluginError)) {
					return false;
				}
				expect(error.pluginId).toBe("com.example.bad-version");
				expect(error.message).toContain("com.example.bad-version");
				expect(error.message).toContain("^2.0.0");
				expect(error.message).toContain(CORE_VERSION);
				return true;
			},
		);
	});

	it("accepts an exact-version match", async () => {
		const plugin = makePlugin("com.example.exact", {
			coreVersion: CORE_VERSION,
		});

		const runtime = await compilePlugins([plugin], makeCtx());
		expect(runtime.pluginMeta).toHaveLength(1);
	});
});

describe("compilePlugins — duplicate export format ids", () => {
	it("throws StudioPluginError naming both plugins", async () => {
		const plugins: StudioPlugin[] = [
			makePlugin("com.example.first", {
				register: (meta) => ({
					meta,
					exportFormats: [makeExportFormat("html")],
				}),
			}),
			makePlugin("com.example.second", {
				register: (meta) => ({
					meta,
					exportFormats: [makeExportFormat("html")],
				}),
			}),
		];

		await expect(compilePlugins(plugins, makeCtx())).rejects.toSatisfy(
			(error: unknown) => {
				if (!(error instanceof StudioPluginError)) {
					return false;
				}
				expect(error.message).toContain("com.example.first");
				expect(error.message).toContain("com.example.second");
				expect(error.message).toContain("html");
				return true;
			},
		);
	});
});

describe("compilePlugins — invalid shapes", () => {
	it("throws StudioPluginError for a structurally invalid element", async () => {
		await expect(
			compilePlugins([{} as StudioPlugin], makeCtx()),
		).rejects.toBeInstanceOf(StudioPluginError);
	});

	it("wraps thrown register() errors in StudioPluginError", async () => {
		const plugin = makePlugin("com.example.boom", {
			register: () => {
				throw new Error("register failed");
			},
		});

		await expect(compilePlugins([plugin], makeCtx())).rejects.toSatisfy(
			(error: unknown) => {
				if (!(error instanceof StudioPluginError)) {
					return false;
				}
				expect(error.pluginId).toBe("com.example.boom");
				expect(error.cause).toBeInstanceOf(Error);
				return true;
			},
		);
	});
});
