/**
 * @file Tests for the browser download helpers (`downloadExportResult`,
 * `exportAndDownload`). jsdom does not implement
 * `URL.createObjectURL`/`revokeObjectURL`, so they are stubbed.
 */

import type { Data as PuckData } from "@puckeditor/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadExportResult, exportAndDownload } from "@/export/download";
import type { ExportFormatDefinition } from "@/types/export";
import type { PageIR } from "@/types/ir";

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let createdAnchors: HTMLAnchorElement[];

beforeEach(() => {
	createObjectURL = vi.fn(() => "blob:mock-url");
	revokeObjectURL = vi.fn();
	// jsdom lacks these static methods; assign rather than spyOn.
	(URL as unknown as { createObjectURL: unknown }).createObjectURL =
		createObjectURL;
	(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL =
		revokeObjectURL;

	createdAnchors = [];
	const realCreate = document.createElement.bind(document);
	vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
		const el = realCreate(tag);
		if (tag === "a") {
			vi.spyOn(el as HTMLAnchorElement, "click").mockImplementation(
				() => undefined,
			);
			createdAnchors.push(el as HTMLAnchorElement);
		}
		return el;
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("downloadExportResult", () => {
	it("creates a blob URL, clicks a named anchor, and revokes the URL", () => {
		downloadExportResult("<html>", "page.html", "text/html");

		expect(createObjectURL).toHaveBeenCalledTimes(1);
		expect(createdAnchors).toHaveLength(1);
		const anchor = createdAnchors[0] as HTMLAnchorElement;
		expect(anchor.download).toBe("page.html");
		expect(anchor.href).toContain("blob:mock-url");
		expect(anchor.click).toHaveBeenCalledTimes(1);
		// Anchor is detached after the click.
		expect(anchor.isConnected).toBe(false);
		// URL is always revoked.
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
	});

	it("downloads Uint8Array content without throwing", () => {
		expect(() =>
			downloadExportResult(
				new Uint8Array([1, 2, 3]),
				"page.bin",
				"application/octet-stream",
			),
		).not.toThrow();
		expect(createObjectURL).toHaveBeenCalledTimes(1);
	});

	it("revokes the URL even if the click throws", () => {
		const realCreate = document.createElement.bind(document);
		(document.createElement as ReturnType<typeof vi.fn>).mockImplementation(
			(tag: string) => {
				const el = realCreate(tag);
				if (tag === "a") {
					vi.spyOn(el as HTMLAnchorElement, "click").mockImplementation(() => {
						throw new Error("click boom");
					});
				}
				return el;
			},
		);

		expect(() => downloadExportResult("x", "p.txt", "text/plain")).toThrow(
			"click boom",
		);
		expect(revokeObjectURL).toHaveBeenCalledTimes(1);
	});
});

describe("exportAndDownload", () => {
	const DATA = { root: { props: {} }, content: [], zones: {} } as PuckData;
	const IR = { version: "1" } as unknown as PageIR;
	const format: ExportFormatDefinition = {
		id: "html",
		label: "HTML",
		extension: "html",
		mimeType: "text/html",
		run: async () => ({ content: "<html>", filename: "page.html" }),
	};

	it("runs the export then downloads, defaulting to the exporter filename", async () => {
		const result = await exportAndDownload({
			format,
			data: DATA,
			toIR: () => IR,
		});

		expect(result.filename).toBe("page.html");
		expect(createdAnchors).toHaveLength(1);
		expect((createdAnchors[0] as HTMLAnchorElement).download).toBe("page.html");
	});

	it("honors a filename override", async () => {
		await exportAndDownload({
			format,
			data: DATA,
			toIR: () => IR,
			filename: "custom.html",
		});
		expect((createdAnchors[0] as HTMLAnchorElement).download).toBe(
			"custom.html",
		);
	});

	it("does not download when the export fails", async () => {
		const failing: ExportFormatDefinition = {
			...format,
			run: async () => {
				throw new Error("boom");
			},
		};
		await expect(
			exportAndDownload({ format: failing, data: DATA, toIR: () => IR }),
		).rejects.toThrow();
		expect(createdAnchors).toHaveLength(0);
	});
});
