/**
 * @file Unit tests for `runExport` — the first-party export runner.
 *
 * Covers: data→IR via the injected `toIR`, format dispatch with the
 * asset-resolver run context, export-store drive (in-flight + record),
 * warning fan-out, and error wrapping (`StudioExportError` with `cause`,
 * existing `StudioExportError` rethrown unwrapped, in-flight always
 * cleared). No DOM — that is the `download.ts` concern.
 */

import type { Config as PuckConfig, Data as PuckData } from "@puckeditor/core";
import { describe, expect, it, vi } from "vitest";

import { runExport } from "@/export/run-export";
import { StudioExportError } from "@/runtime/errors";
import type { ExportStoreApi } from "@/state/index";
import type { ExportFormatDefinition, ExportResult } from "@/types/export";
import type { PageIR } from "@/types/ir";
import type { CompiledAppearance } from "../../style-compiler/compile.js";
import { compileDocumentAppearance } from "../../style-compiler/compile.js";

const DATA = { root: { props: {} }, content: [], zones: {} } as PuckData;
const IR = { version: "1", root: { type: "__root__" } } as unknown as PageIR;

function makeFormat(
	run: ExportFormatDefinition["run"],
	id = "html",
): ExportFormatDefinition {
	return {
		id,
		label: id.toUpperCase(),
		extension: id,
		mimeType: `text/${id}`,
		run,
	};
}

function makeStore(): {
	store: ExportStoreApi;
	setIsExporting: ReturnType<typeof vi.fn>;
	recordExport: ReturnType<typeof vi.fn>;
} {
	const setIsExporting = vi.fn();
	const recordExport = vi.fn();
	const store = {
		getState: () => ({ setIsExporting, recordExport }),
	} as unknown as ExportStoreApi;
	return { store, setIsExporting, recordExport };
}

describe("runExport — happy path", () => {
	it("normalizes via toIR and dispatches the format", async () => {
		const result: ExportResult = { content: "<html>", filename: "page.html" };
		const run = vi.fn(async () => result);
		const toIR = vi.fn(() => IR);

		const out = await runExport({
			format: makeFormat(run),
			data: DATA,
			toIR,
			options: { title: "Hi" },
		});

		expect(toIR).toHaveBeenCalledWith(DATA);
		expect(run).toHaveBeenCalledWith(IR, { title: "Hi" }, undefined);
		expect(out).toBe(result);
	});

	it("awaits an async toIR", async () => {
		const run = vi.fn(async () => ({ content: "x", filename: "p" }));
		const toIR = vi.fn(async () => IR);

		await runExport({ format: makeFormat(run), data: DATA, toIR });

		expect(run).toHaveBeenCalledWith(IR, {}, undefined);
	});

	it("passes asset resolvers in the run context when provided", async () => {
		const run = vi.fn(async () => ({ content: "x", filename: "p" }));
		const resolver = () => null;

		await runExport({
			format: makeFormat(run),
			data: DATA,
			toIR: () => IR,
			assetResolvers: [resolver],
		});

		expect(run).toHaveBeenCalledWith(IR, {}, { assetResolvers: [resolver] });
	});

	it("fans warnings out to onWarning (and still returns them)", async () => {
		const warnings = [
			{ level: "warn" as const, code: "no-alt", message: "missing alt" },
		];
		const run = vi.fn(async () => ({ content: "x", filename: "p", warnings }));
		const onWarning = vi.fn();

		const out = await runExport({
			format: makeFormat(run),
			data: DATA,
			toIR: () => IR,
			onWarning,
		});

		expect(onWarning).toHaveBeenCalledTimes(1);
		expect(onWarning).toHaveBeenCalledWith(warnings[0]);
		expect(out.warnings).toBe(warnings);
	});
});

describe("runExport — export store", () => {
	it("drives setIsExporting(true) → recordExport(id, true) → setIsExporting(false)", async () => {
		const { store, setIsExporting, recordExport } = makeStore();
		const run = vi.fn(async () => ({ content: "x", filename: "p" }));

		await runExport({
			format: makeFormat(run, "json"),
			data: DATA,
			toIR: () => IR,
			exportStore: store,
		});

		expect(setIsExporting.mock.calls).toEqual([[true], [false]]);
		expect(recordExport).toHaveBeenCalledWith("json", true);
	});

	it("records failure and still clears the in-flight flag when the format throws", async () => {
		const { store, setIsExporting, recordExport } = makeStore();
		const run = vi.fn(async () => {
			throw new Error("boom");
		});

		await expect(
			runExport({
				format: makeFormat(run, "json"),
				data: DATA,
				toIR: () => IR,
				exportStore: store,
			}),
		).rejects.toBeInstanceOf(StudioExportError);

		expect(recordExport).toHaveBeenCalledWith("json", false);
		expect(setIsExporting.mock.calls).toEqual([[true], [false]]);
	});

	it("works without an export store", async () => {
		const run = vi.fn(async () => ({ content: "x", filename: "p" }));
		await expect(
			runExport({ format: makeFormat(run), data: DATA, toIR: () => IR }),
		).resolves.toBeDefined();
	});

	it("does not misattribute a throwing onWarning as an export failure", async () => {
		const { store, recordExport } = makeStore();
		const warnings = [{ level: "warn" as const, code: "x", message: "m" }];
		const run = vi.fn(async () => ({ content: "x", filename: "p", warnings }));
		const onWarning = vi.fn(() => {
			throw new Error("reporter boom");
		});

		const error = await runExport({
			format: makeFormat(run, "json"),
			data: DATA,
			toIR: () => IR,
			exportStore: store,
			onWarning,
		}).catch((e: unknown) => e);

		// The host reporter bug surfaces as itself, NOT wrapped as an export
		// failure...
		expect(error).toBeInstanceOf(Error);
		expect(error).not.toBeInstanceOf(StudioExportError);
		expect((error as Error).message).toContain("reporter boom");
		// ...and the export was still recorded successful (the run succeeded).
		expect(recordExport).toHaveBeenCalledWith("json", true);
	});
});

describe("runExport — error wrapping", () => {
	it("wraps a thrown error in StudioExportError preserving the cause and format id", async () => {
		const cause = new Error("inner boom");
		const run = vi.fn(async () => {
			throw cause;
		});

		const error = await runExport({
			format: makeFormat(run, "react"),
			data: DATA,
			toIR: () => IR,
		}).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(StudioExportError);
		expect((error as StudioExportError).formatId).toBe("react");
		expect((error as StudioExportError).cause).toBe(cause);
		expect((error as Error).message).toContain("inner boom");
	});

	it("rethrows an existing StudioExportError unwrapped (no double-wrap)", async () => {
		const original = new StudioExportError("html", "already wrapped");
		const run = vi.fn(async () => {
			throw original;
		});

		const error = await runExport({
			format: makeFormat(run),
			data: DATA,
			toIR: () => IR,
		}).catch((e: unknown) => e);

		expect(error).toBe(original);
	});

	it("wraps a failure originating in toIR too", async () => {
		const run = vi.fn(async () => ({ content: "x", filename: "p" }));
		const error = await runExport({
			format: makeFormat(run),
			data: DATA,
			toIR: () => {
				throw new Error("ir boom");
			},
		}).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(StudioExportError);
		expect(run).not.toHaveBeenCalled();
	});
});

describe("runExport — compiled appearance (P4-05, §9.3)", () => {
	const v2Config = {
		components: {
			Hero: {
				fields: {},
				metadata: {
					anvilkit: {
						editor: {
							version: "2",
							styleTargets: {
								root: { label: "Hero", properties: ["display"] },
							},
						},
					},
				},
				render: () => null,
			},
		},
	} as unknown as PuckConfig;

	const v2Data = {
		content: [
			{
				type: "Hero",
				props: {
					id: "hero-1",
					appearance: {
						version: "1",
						targets: {
							root: { style: { base: { layout: { display: "flex" } } } },
						},
					},
				},
			},
		],
		root: { props: {} },
		zones: {},
	} as unknown as PuckData;

	it("compiles the exported document and hands formats the artifact on the run context", async () => {
		const run = vi.fn<ExportFormatDefinition["run"]>(async () => ({
			content: "x",
			filename: "p",
		}));
		await runExport({
			format: makeFormat(run),
			data: v2Data,
			config: v2Config,
			toIR: () => IR,
		});
		const runCtx = run.mock.calls[0]?.[2] as
			| { compiledAppearance?: CompiledAppearance }
			| undefined;
		const direct = compileDocumentAppearance({
			data: v2Data,
			config: v2Config,
		});
		expect(runCtx?.compiledAppearance?.css).toBe(direct.css);
		expect(runCtx?.compiledAppearance?.fingerprint).toBe(direct.fingerprint);
	});

	it("fans compiler diagnostics out through onWarning (§9.2 step 6)", async () => {
		const bogusTargetData = {
			content: [
				{
					type: "Hero",
					props: {
						id: "hero-1",
						appearance: {
							version: "1",
							targets: {
								bogus: { style: { base: { layout: { display: "flex" } } } },
							},
						},
					},
				},
			],
			root: { props: {} },
			zones: {},
		} as unknown as PuckData;
		const warnings: string[] = [];
		await runExport({
			format: makeFormat(async () => ({ content: "x", filename: "p" })),
			data: bogusTargetData,
			config: v2Config,
			toIR: () => IR,
			onWarning: (warning) => {
				warnings.push(warning.code);
			},
		});
		const direct = compileDocumentAppearance({
			data: bogusTargetData,
			config: v2Config,
		});
		expect(direct.diagnostics.length).toBeGreaterThan(0);
		expect(warnings.length).toBeGreaterThanOrEqual(direct.diagnostics.length);
	});

	it("passes no artifact when no config is supplied", async () => {
		const run = vi.fn<ExportFormatDefinition["run"]>(async () => ({
			content: "x",
			filename: "p",
		}));
		await runExport({ format: makeFormat(run), data: v2Data, toIR: () => IR });
		expect(run.mock.calls[0]?.[2]).toBeUndefined();
	});
});
