/**
 * @file Compile-time type tests for `src/types/export.ts`.
 *
 * Enforced by `tsc --noEmit -p tsconfig.test.json`. See
 * `plugin.test.ts` for the broader rationale behind the
 * type-test-only pattern.
 */

import { describe, expect, it } from "vitest";

import type {
	ExportFormatDefinition,
	ExportOptions,
	ExportResult,
	ExportWarning,
} from "../export.js";
import type { PageIR } from "../ir.js";

describe("ExportFormatDefinition type contract", () => {
	it("accepts a minimal text-format definition", () => {
		const html: ExportFormatDefinition = {
			id: "html",
			label: "HTML",
			extension: "html",
			mimeType: "text/html",
			async run(ir, _options) {
				const _typed: PageIR = ir;
				void _typed;
				return { content: "<!doctype html>", filename: "page.html" };
			},
		};
		void html;
		expect(true).toBe(true);
	});

	it("accepts a binary-format definition returning Uint8Array", () => {
		const pdf: ExportFormatDefinition = {
			id: "pdf",
			label: "PDF",
			extension: "pdf",
			mimeType: "application/pdf",
			async run(_ir, _options) {
				return {
					content: new Uint8Array([37, 80, 68, 70]), // "%PDF"
					filename: "page.pdf",
				};
			},
		};
		void pdf;
	});

	it("narrows options when parameterized with a typed bag", () => {
		interface HtmlOpts extends Record<string, unknown> {
			readonly inlineStyles: boolean;
			readonly minify?: boolean;
		}
		const html: ExportFormatDefinition<HtmlOpts> = {
			id: "html",
			label: "HTML",
			extension: "html",
			mimeType: "text/html",
			async run(_ir, options) {
				// Options is strongly typed — `inlineStyles` is a boolean.
				const inlineStyles: boolean = options.inlineStyles;
				void inlineStyles;
				return { content: "", filename: "page.html" };
			},
		};
		void html;

		const opts: ExportOptions<HtmlOpts> = {
			inlineStyles: true,
			minify: false,
		};
		void opts;

		// @ts-expect-error — `inlineStyles` must be a boolean.
		const invalidOpts: ExportOptions<HtmlOpts> = { inlineStyles: "yes" };
		void invalidOpts;
	});

	it("ExportResult accepts string OR Uint8Array content", () => {
		const textResult: ExportResult = {
			content: "<html></html>",
			filename: "page.html",
		};
		void textResult;

		const bytesResult: ExportResult = {
			content: new Uint8Array(),
			filename: "page.pdf",
		};
		void bytesResult;

		// @ts-expect-error — numbers are not valid content.
		const invalidContent: ExportResult["content"] = 42;
		void invalidContent;
	});

	it("ExportWarning.level is restricted to the three severity values", () => {
		const warning: ExportWarning = {
			level: "warn",
			code: "missing-alt-text",
			message: "Image is missing alt text",
			nodeId: "img-42",
		};
		void warning;

		// @ts-expect-error — `"debug"` is not a valid warning level.
		const invalidLevel: ExportWarning["level"] = "debug";
		void invalidLevel;
	});

	it("ExportFormatDefinition rejects missing required fields", () => {
		// @ts-expect-error — `mimeType` is required.
		const missingMime: ExportFormatDefinition = {
			id: "x",
			label: "X",
			extension: "x",
			async run() {
				return { content: "", filename: "x" };
			},
		};
		void missingMime;

		// @ts-expect-error — `run` is required.
		const missingRun: ExportFormatDefinition = {
			id: "x",
			label: "X",
			extension: "x",
			mimeType: "text/plain",
		};
		void missingRun;
	});

	it("ExportFormatDefinition.run must return a Promise", () => {
		// @ts-expect-error — sync return type is not assignable to `Promise<ExportResult>`.
		const syncRun: ExportFormatDefinition["run"] = (_ir, _options) => ({
			content: "",
			filename: "x",
		});
		void syncRun;
	});
});
