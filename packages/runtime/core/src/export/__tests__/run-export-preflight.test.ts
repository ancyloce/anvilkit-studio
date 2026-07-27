/**
 * `runExport` preflight enforcement (PLAN-0020 CORE-P3-009;
 * DD-0019 §23.2).
 *
 * The pure matrix lives in `editor/__tests__/export-preflight.test.ts`.
 * These tests cover the half that makes the gate real: that a blocked
 * verdict actually stops the format from running, and that a degraded
 * one reaches the host's existing warning channel.
 */

import { describe, expect, it, vi } from "vitest";
import { StudioExportError } from "@/runtime/errors";
import type { ExportFormatDefinition, ExportResult } from "@/types/export";
import type { PageIR } from "@/types/ir";
import { runExportPreflight } from "../../editor/export-preflight.js";
import { assertContentFreeEvent } from "../../testing/editor/assertions.js";
import { runExport } from "../run-export.js";

const IR = { root: {}, content: [] } as unknown as PageIR;

function formatWith(
	run = vi.fn(
		async (): Promise<ExportResult> => ({
			filename: "out.html",
			content: "<html></html>",
		}),
	),
): { format: ExportFormatDefinition; run: typeof run } {
	const format = {
		id: "html",
		label: "HTML",
		extension: "html",
		mimeType: "text/html",
		run,
	} as unknown as ExportFormatDefinition;
	return { format, run };
}

const blocked = runExportPreflight({
	usedFeatures: ["bindings"],
	capabilities: { version: "1", supportedFeatures: [] },
});

const degraded = runExportPreflight({
	usedFeatures: ["bindings"],
	capabilities: { version: "1", supportedFeatures: [] },
	mode: "development",
});

const passed = runExportPreflight({
	usedFeatures: ["bindings"],
	capabilities: { version: "1", supportedFeatures: ["bindings"] },
});

describe("runExport — preflight enforcement", () => {
	it("never runs the format when the verdict is blocked", async () => {
		// The point of the gate: a format that emitted output would leave
		// the author holding a file that silently dropped their work.
		const { format, run } = formatWith();
		await expect(
			runExport({
				format,
				data: {} as never,
				toIR: () => IR,
				preflight: blocked,
			}),
		).rejects.toBeInstanceOf(StudioExportError);
		expect(run).not.toHaveBeenCalled();
	});

	it("names the unsupported feature in the thrown error", async () => {
		const { format } = formatWith();
		await expect(
			runExport({
				format,
				data: {} as never,
				toIR: () => IR,
				preflight: blocked,
			}),
		).rejects.toThrow(/bindings/);
	});

	it("records the blocked attempt as a failed export", async () => {
		const recordExport = vi.fn();
		const store = {
			getState: () => ({
				setIsExporting: vi.fn(),
				recordExport,
			}),
		} as never;
		const { format } = formatWith();
		await expect(
			runExport({
				format,
				data: {} as never,
				toIR: () => IR,
				preflight: blocked,
				exportStore: store,
			}),
		).rejects.toBeInstanceOf(StudioExportError);
		expect(recordExport).toHaveBeenCalledWith("html", false);
	});

	it("runs the format and warns when the verdict is degraded", async () => {
		const { format, run } = formatWith();
		const onWarning = vi.fn();
		const result = await runExport({
			format,
			data: {} as never,
			toIR: () => IR,
			preflight: degraded,
			onWarning,
		});
		expect(run).toHaveBeenCalledOnce();
		expect(result.filename).toBe("out.html");
		// Routed through the host's existing ExportWarning channel, so a
		// host that already renders warnings needs no new wiring.
		expect(onWarning).toHaveBeenCalledWith(
			expect.objectContaining({ code: "EDITOR_EXPORTER_UNSUPPORTED" }),
		);
	});

	it("runs normally when the verdict passes", async () => {
		const { format, run } = formatWith();
		const onWarning = vi.fn();
		await runExport({
			format,
			data: {} as never,
			toIR: () => IR,
			preflight: passed,
			onWarning,
		});
		expect(run).toHaveBeenCalledOnce();
		expect(onWarning).not.toHaveBeenCalled();
	});

	it("exports normally when no preflight is supplied", async () => {
		// The pre-editor path must keep working through any format.
		const { format, run } = formatWith();
		await runExport({ format, data: {} as never, toIR: () => IR });
		expect(run).toHaveBeenCalledOnce();
	});
});

describe("export.validation event emission (CORE-P4-004)", () => {
	// `runExportPreflight` always BUILT this payload, but until
	// CORE-P4-004 nothing emitted it — an operational event no operator
	// could observe. §32.1 requires every commit/rejection to emit one.
	it("emits a content-free passed event for an allowed export", async () => {
		const { format } = formatWith();
		const onValidation = vi.fn();
		await runExport({
			format,
			data: {} as never,
			toIR: () => IR,
			preflight: passed,
			onValidation,
		});
		expect(onValidation).toHaveBeenCalledTimes(1);
		expect(onValidation).toHaveBeenCalledWith({
			type: "export.validation",
			status: "passed",
			featureIds: ["bindings"],
		});
	});

	it("emits BEFORE the blocked throw, so a rejection is reported too", async () => {
		const { format } = formatWith();
		const onValidation = vi.fn();
		await expect(
			runExport({
				format,
				data: {} as never,
				toIR: () => IR,
				preflight: blocked,
				onValidation,
			}),
		).rejects.toBeInstanceOf(StudioExportError);
		expect(onValidation).toHaveBeenCalledWith(
			expect.objectContaining({ status: "failed" }),
		);
	});

	it("reports a degraded dev preview as failed validation", async () => {
		const { format } = formatWith();
		const onValidation = vi.fn();
		await runExport({
			format,
			data: {} as never,
			toIR: () => IR,
			preflight: degraded,
			onValidation,
		});
		expect(onValidation).toHaveBeenCalledWith(
			expect.objectContaining({ status: "failed" }),
		);
	});

	it("carries no content — only feature ids and a binary status", () => {
		assertContentFreeEvent(blocked.event);
		assertContentFreeEvent(passed.event);
	});

	it("survives a throwing host sink without failing the export", async () => {
		// A broken reporting hook is a host bug; misattributing it as an
		// export failure would send people debugging the wrong system.
		const { format, run } = formatWith();
		await expect(
			runExport({
				format,
				data: {} as never,
				toIR: () => IR,
				preflight: passed,
				onValidation: () => {
					throw new Error("host sink exploded");
				},
			}),
		).resolves.toMatchObject({ filename: "out.html" });
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("emits nothing when no preflight verdict was supplied", async () => {
		// The pre-editor path: no editor features in play, nothing to
		// validate, so no event.
		const { format } = formatWith();
		const onValidation = vi.fn();
		await runExport({
			format,
			data: {} as never,
			toIR: () => IR,
			onValidation,
		});
		expect(onValidation).not.toHaveBeenCalled();
	});
});
