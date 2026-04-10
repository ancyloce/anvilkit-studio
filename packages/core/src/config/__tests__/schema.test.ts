/**
 * @file Runtime + type tests for `StudioConfigSchema`.
 *
 * Runtime assertions cover:
 * - Layer 1 (pure defaults): `.parse({})` produces a fully populated
 *   shape with every documented default applied.
 * - Layered override: partial input merges with defaults field by
 *   field, leaving untouched sections at their defaults.
 * - Strict mode: unknown top-level keys throw.
 * - Validators: `z.url()`, `.int().min().max()` reject bad input.
 *
 * Compile-time assertions cover:
 * - `StudioConfig` (the inferred type) is assignable to/from a plain
 *   object literal.
 * - `ComponentPackageManifest` enforces its closed `scaffoldType`
 *   union.
 */

import { describe, expect, it } from "vitest";

import type { ComponentPackageManifest, StudioConfig } from "../../types/config.js";
import { StudioConfigSchema } from "../schema.js";

describe("StudioConfigSchema — runtime defaults", () => {
	it("`.parse({})` produces a fully-defaulted config", () => {
		const parsed = StudioConfigSchema.parse({});

		expect(parsed.features.enableExport).toBe(false);
		expect(parsed.features.enableAi).toBe(false);
		expect(parsed.features.enableCollaboration).toBe(false);

		expect(parsed.branding.appName).toBe("AnvilKit Studio");
		expect(parsed.branding.logoUrl).toBeUndefined();
		expect(parsed.branding.primaryColor).toBeUndefined();

		expect(parsed.theme.defaultMode).toBe("system");
		expect(parsed.theme.allowToggle).toBe(true);

		expect(parsed.export.defaultFormat).toBeUndefined();
		expect(parsed.export.filenamePrefix).toBe("page");

		expect(parsed.ai.defaultModel).toBeUndefined();
		expect(parsed.ai.maxRetries).toBe(3);

		expect(parsed.experimental).toEqual({});
	});

	it("`.parse(undefined)` produces the same fully-defaulted config", () => {
		// Top-level `.prefault({})` means a missing config block is
		// still valid and produces the full default shape.
		const parsed = StudioConfigSchema.parse(undefined);
		expect(parsed.theme.defaultMode).toBe("system");
		expect(parsed.features.enableExport).toBe(false);
	});
});

describe("StudioConfigSchema — layered overrides", () => {
	it("merges a partial input with defaults at nested-field granularity", () => {
		const parsed = StudioConfigSchema.parse({
			features: { enableExport: true },
		});

		// Only `enableExport` was overridden — the other feature
		// flags fall back to defaults.
		expect(parsed.features.enableExport).toBe(true);
		expect(parsed.features.enableAi).toBe(false);
		expect(parsed.features.enableCollaboration).toBe(false);

		// Untouched sections stay at their defaults.
		expect(parsed.branding.appName).toBe("AnvilKit Studio");
		expect(parsed.theme.defaultMode).toBe("system");
		expect(parsed.ai.maxRetries).toBe(3);
	});

	it("accepts a fully-specified config without modification", () => {
		const parsed = StudioConfigSchema.parse({
			features: {
				enableExport: true,
				enableAi: true,
				enableCollaboration: false,
			},
			branding: {
				appName: "Custom Studio",
				logoUrl: "https://example.com/logo.svg",
				primaryColor: "var(--brand)",
			},
			theme: { defaultMode: "dark", allowToggle: false },
			export: { defaultFormat: "html", filenamePrefix: "draft" },
			ai: { defaultModel: "claude-opus-4-6", maxRetries: 5 },
			experimental: { someFlag: true, anotherFlag: { nested: "value" } },
		});

		expect(parsed.branding.appName).toBe("Custom Studio");
		expect(parsed.branding.logoUrl).toBe("https://example.com/logo.svg");
		expect(parsed.theme.defaultMode).toBe("dark");
		expect(parsed.export.defaultFormat).toBe("html");
		expect(parsed.ai.defaultModel).toBe("claude-opus-4-6");
		expect(parsed.experimental.someFlag).toBe(true);
	});

	it("carries unknown `experimental` subkeys through verbatim", () => {
		const parsed = StudioConfigSchema.parse({
			experimental: { "com.example.feature": { a: 1 } },
		});
		expect(parsed.experimental["com.example.feature"]).toEqual({ a: 1 });
	});
});

describe("StudioConfigSchema — strict mode", () => {
	it("rejects unknown top-level keys", () => {
		// `.parse()` takes `unknown`, so bad shapes are a runtime
		// check — no `@ts-expect-error` directive needed.
		expect(() =>
			StudioConfigSchema.parse({
				feature: { enableExport: true },
			}),
		).toThrow();
	});

	it("rejects unknown keys inside a known section", () => {
		expect(() =>
			StudioConfigSchema.parse({
				features: {
					enableExport: true,
					enableTelemetry: true,
				},
			}),
		).toThrow();
	});
});

describe("StudioConfigSchema — field validators", () => {
	it("rejects a non-URL `branding.logoUrl`", () => {
		expect(() =>
			StudioConfigSchema.parse({
				branding: { logoUrl: "not a url" },
			}),
		).toThrow();
	});

	it("rejects a `theme.defaultMode` outside the enum", () => {
		expect(() =>
			StudioConfigSchema.parse({
				theme: { defaultMode: "sepia" },
			}),
		).toThrow();
	});

	it("clamps `ai.maxRetries` to the [0, 10] range", () => {
		expect(() =>
			StudioConfigSchema.parse({ ai: { maxRetries: -1 } }),
		).toThrow();
		expect(() =>
			StudioConfigSchema.parse({ ai: { maxRetries: 11 } }),
		).toThrow();
		expect(() =>
			StudioConfigSchema.parse({ ai: { maxRetries: 3.5 } }),
		).toThrow();

		const ok = StudioConfigSchema.parse({ ai: { maxRetries: 7 } });
		expect(ok.ai.maxRetries).toBe(7);
	});
});

describe("StudioConfig — type-level assertions", () => {
	it("is assignable from a plain object literal", () => {
		// Compile-time check — value identity irrelevant.
		const config: StudioConfig = {
			features: {
				enableExport: true,
				enableAi: false,
				enableCollaboration: false,
			},
			branding: {
				appName: "Demo",
				logoUrl: "https://example.com/logo.svg",
				primaryColor: "#f00",
			},
			theme: { defaultMode: "light", allowToggle: true },
			export: { defaultFormat: "html", filenamePrefix: "page" },
			ai: { defaultModel: "claude-opus-4-6", maxRetries: 3 },
			experimental: {},
		};
		void config;
		expect(true).toBe(true);
	});

	it("is assignable to the parse output", () => {
		const parsed = StudioConfigSchema.parse({});
		const asConfig: StudioConfig = parsed;
		void asConfig;
	});
});

describe("ComponentPackageManifest — type-level assertions", () => {
	it("accepts a well-formed manifest", () => {
		const manifest: ComponentPackageManifest = {
			name: "@anvilkit/button",
			version: "0.2.0",
			slug: "button",
			displayName: "Button",
			scaffoldType: "form",
			schemaVersion: "1",
			entry: "@anvilkit/button",
		};
		void manifest;
	});

	it("enforces the closed `scaffoldType` union", () => {
		// @ts-expect-error — `"widget"` is not in the scaffold union.
		const invalid: ComponentPackageManifest["scaffoldType"] = "widget";
		void invalid;
	});
});
