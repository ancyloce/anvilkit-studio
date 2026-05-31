/**
 * @file Runtime tests for `lazyPlugin` / `lazyPluginWith` and the
 * `withoutHeaderActions` registration transform.
 *
 * Acceptance criteria covered:
 * - The compile-time gates (id-uniqueness + `coreVersion`) run on the
 *   *declared* meta and reject WITHOUT ever invoking the loader, so a
 *   rejected plugin never pays the dynamic-import cost.
 * - On a successful compile the loader is awaited exactly once and the
 *   real plugin's `register()` result is aggregated.
 * - The loaded module's id / `coreVersion` are re-validated at fetch
 *   time so a lazy plugin cannot smuggle in a mismatched id or an
 *   incompatible core version.
 * - `lazyPluginWith(..., withoutHeaderActions)` strips `headerActions`
 *   inside the lazy boundary while preserving every other contribution,
 *   and still defers the fetch.
 * - `withoutHeaderActions` is a pure registration transform.
 */

import { describe, expect, it, vi } from "vitest";

import { StudioConfigSchema } from "@/config/schema";
import { compilePlugins } from "@/runtime/compile-plugins";
import { StudioPluginError } from "@/runtime/errors";
import {
	lazyPlugin,
	lazyPluginWith,
	withoutHeaderActions,
} from "@/runtime/lazy-plugin";
import type { ExportFormatDefinition, ExportResult } from "@/types/export";
import type {
	StudioHeaderAction,
	StudioPlugin,
	StudioPluginContext,
	StudioPluginMeta,
	StudioPluginRegistration,
} from "@/types/plugin";

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
		registerAssetResolver: vi.fn(),
	};
}

function makeMeta(overrides: Partial<StudioPluginMeta> = {}): StudioPluginMeta {
	return {
		id: "com.example.lazy",
		name: "Lazy Example",
		version: "1.0.0",
		coreVersion: "^0.1.0",
		...overrides,
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

function makeHeaderAction(id: string): StudioHeaderAction {
	return { id, label: id, onClick: () => undefined };
}

/**
 * A plain (already-resolved) plugin the lazy loader returns. Its
 * `register` is a spy so tests can assert delegation.
 */
function makeRealPlugin(
	meta: StudioPluginMeta,
	registration: Omit<StudioPluginRegistration, "meta"> = {},
): StudioPlugin & { register: ReturnType<typeof vi.fn> } {
	const register = vi.fn(
		(): StudioPluginRegistration => ({ meta, ...registration }),
	);
	return { meta, register };
}

describe("lazyPlugin — gates run without fetching the chunk", () => {
	it("rejects an incompatible declared coreVersion before calling the loader", async () => {
		const load = vi.fn(async () => makeRealPlugin(makeMeta()));
		const plugin = lazyPlugin(load, makeMeta({ coreVersion: "^99.0.0" }));

		await expect(compilePlugins([plugin], makeCtx())).rejects.toThrow(
			StudioPluginError,
		);
		expect(load).not.toHaveBeenCalled();
	});

	it("rejects a duplicate declared id before calling the lazy loader", async () => {
		const load = vi.fn(async () => makeRealPlugin(makeMeta({ id: "dup" })));
		const eager: StudioPlugin = {
			meta: makeMeta({ id: "dup", name: "Eager Dup" }),
			register: (): StudioPluginRegistration => ({
				meta: makeMeta({ id: "dup", name: "Eager Dup" }),
			}),
		};
		const lazy = lazyPlugin(load, makeMeta({ id: "dup", name: "Lazy Dup" }));

		await expect(compilePlugins([eager, lazy], makeCtx())).rejects.toThrow(
			StudioPluginError,
		);
		expect(load).not.toHaveBeenCalled();
	});
});

describe("lazyPlugin — successful compile", () => {
	it("awaits the loader once and aggregates the real registration", async () => {
		const meta = makeMeta({ id: "com.example.ok" });
		const real = makeRealPlugin(meta, {
			exportFormats: [makeExportFormat("html")],
			headerActions: [makeHeaderAction("export-html")],
		});
		const load = vi.fn(async () => real);
		const plugin = lazyPlugin(load, meta);

		const runtime = await compilePlugins([plugin], makeCtx());

		expect(load).toHaveBeenCalledTimes(1);
		expect(real.register).toHaveBeenCalledTimes(1);
		expect(runtime.pluginMeta.map((m) => m.id)).toEqual(["com.example.ok"]);
		expect(runtime.exportFormats.has("html")).toBe(true);
		expect(runtime.headerActions.map((a) => a.id)).toEqual(["export-html"]);
	});
});

describe("lazyPlugin — re-validates the loaded module", () => {
	it("throws when the loaded module's id differs from the declared id", async () => {
		const real = makeRealPlugin(makeMeta({ id: "actual" }));
		const load = vi.fn(async () => real);
		const plugin = lazyPlugin(load, makeMeta({ id: "declared" }));

		await expect(compilePlugins([plugin], makeCtx())).rejects.toThrow(
			StudioPluginError,
		);
		expect(load).toHaveBeenCalledTimes(1);
		expect(real.register).not.toHaveBeenCalled();
	});

	it("throws when the loaded module's coreVersion is incompatible", async () => {
		const real = makeRealPlugin(
			makeMeta({ id: "same", coreVersion: "^99.0.0" }),
		);
		const load = vi.fn(async () => real);
		// Declared coreVersion passes the up-front gate; the real one fails.
		const plugin = lazyPlugin(load, makeMeta({ id: "same" }));

		await expect(compilePlugins([plugin], makeCtx())).rejects.toThrow(
			StudioPluginError,
		);
		expect(real.register).not.toHaveBeenCalled();
	});
});

describe("lazyPluginWith + withoutHeaderActions", () => {
	it("strips headerActions inside the lazy boundary, keeping other contributions", async () => {
		const meta = makeMeta({ id: "com.example.withheader" });
		const real = makeRealPlugin(meta, {
			exportFormats: [makeExportFormat("html")],
			headerActions: [makeHeaderAction("export-html")],
		});
		const load = vi.fn(async () => real);
		const plugin = lazyPluginWith(load, meta, withoutHeaderActions);

		const runtime = await compilePlugins([plugin], makeCtx());

		expect(load).toHaveBeenCalledTimes(1);
		expect(runtime.exportFormats.has("html")).toBe(true);
		expect(runtime.headerActions).toEqual([]);
	});

	it("defers the loader until a successful gate, like lazyPlugin", async () => {
		const load = vi.fn(async () => makeRealPlugin(makeMeta()));
		const plugin = lazyPluginWith(
			load,
			makeMeta({ coreVersion: "^99.0.0" }),
			withoutHeaderActions,
		);

		await expect(compilePlugins([plugin], makeCtx())).rejects.toThrow(
			StudioPluginError,
		);
		expect(load).not.toHaveBeenCalled();
	});
});

describe("withoutHeaderActions — pure transform", () => {
	it("removes the headerActions key and preserves the rest by reference", () => {
		const meta = makeMeta();
		const formats = [makeExportFormat("html")];
		const registration: StudioPluginRegistration = {
			meta,
			headerActions: [makeHeaderAction("export-html")],
			exportFormats: formats,
		};

		const result = withoutHeaderActions(registration);

		expect("headerActions" in result).toBe(false);
		expect(result.meta).toBe(meta);
		expect(result.exportFormats).toBe(formats);
	});
});
