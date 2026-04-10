/**
 * @file Runtime tests for `createExportRegistry`.
 *
 * Acceptance criteria covered:
 * - `get` / `has` / `list` / `size` round-trip the input array.
 * - `list()` preserves insertion order.
 * - Duplicate `id` throws `StudioPluginError` with the offending id.
 * - `get` / `has` return `undefined` / `false` for unknown ids.
 * - The returned object is a fresh snapshot — mutating `list()`'s
 *   array does not corrupt the registry.
 */

import { describe, expect, it } from "vitest";

import type {
	ExportFormatDefinition,
	ExportResult,
} from "../../types/export.js";
import { StudioPluginError } from "../errors.js";
import { createExportRegistry } from "../export-registry.js";

function makeFormat(id: string): ExportFormatDefinition {
	return {
		id,
		label: id.toUpperCase(),
		extension: id,
		mimeType: `application/${id}`,
		async run(): Promise<ExportResult> {
			return { content: `<${id} />`, filename: `page.${id}` };
		},
	};
}

describe("createExportRegistry — empty", () => {
	it("returns a registry with size 0 and an empty list", () => {
		const registry = createExportRegistry([]);
		expect(registry.size()).toBe(0);
		expect(registry.list()).toEqual([]);
		expect(registry.has("html")).toBe(false);
		expect(registry.get("html")).toBeUndefined();
	});
});

describe("createExportRegistry — happy path", () => {
	it("exposes get/has/size for every registered format", () => {
		const html = makeFormat("html");
		const json = makeFormat("json");
		const registry = createExportRegistry([html, json]);

		expect(registry.size()).toBe(2);
		expect(registry.has("html")).toBe(true);
		expect(registry.has("json")).toBe(true);
		expect(registry.get("html")).toBe(html);
		expect(registry.get("json")).toBe(json);
	});

	it("preserves insertion order in list()", () => {
		const registry = createExportRegistry([
			makeFormat("html"),
			makeFormat("json"),
			makeFormat("pdf"),
		]);

		expect(registry.list().map((format) => format.id)).toEqual([
			"html",
			"json",
			"pdf",
		]);
	});

	it("returns undefined / false for unknown ids", () => {
		const registry = createExportRegistry([makeFormat("html")]);
		expect(registry.get("react")).toBeUndefined();
		expect(registry.has("react")).toBe(false);
	});

	it("list() returns a fresh array — mutating it does not affect the registry", () => {
		const registry = createExportRegistry([makeFormat("html")]);
		const snapshot = registry.list();
		snapshot.push(makeFormat("injected"));

		expect(registry.size()).toBe(1);
		expect(registry.has("injected")).toBe(false);
		expect(registry.list()).toHaveLength(1);
	});
});

describe("createExportRegistry — duplicate detection", () => {
	it("throws StudioPluginError when two formats share an id", () => {
		expect(() =>
			createExportRegistry([makeFormat("html"), makeFormat("html")]),
		).toThrowError(StudioPluginError);
	});

	it("the thrown error mentions the duplicated id", () => {
		try {
			createExportRegistry([makeFormat("html"), makeFormat("html")]);
			throw new Error("expected createExportRegistry to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(StudioPluginError);
			if (error instanceof StudioPluginError) {
				expect(error.pluginId).toBe("html");
				expect(error.message).toContain("html");
			}
		}
	});
});
