/**
 * @file Unit tests for the config-centric i18n fingerprint helpers
 * (`stripReactiveConfig` + `mergeLiveI18n`).
 *
 * `stripReactiveConfig` is the recompile carve-out: two configs differing
 * ONLY in the `i18n` block must fingerprint identically (locale switches
 * are recompile-free), while any non-`i18n` difference must still change
 * the fingerprint. `mergeLiveI18n` is the live half: it overlays the raw
 * `i18n` partial onto the compiled block with `typeof` guards standing in
 * for the skipped Zod re-parse.
 */

import type { DeepPartial } from "@anvilkit/utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	createConfigFingerprinter,
	mergeLiveI18n,
	stripReactiveConfig,
} from "@/components/plugin-fingerprint";
import { StudioConfigSchema } from "@/config/schema";
import type { StudioConfig } from "@/types/config";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("stripReactiveConfig", () => {
	it("passes undefined/null through unchanged", () => {
		expect(stripReactiveConfig(undefined)).toBeUndefined();
		expect(
			stripReactiveConfig(null as unknown as DeepPartial<StudioConfig>),
		).toBeNull();
	});

	it("returns the input BY REFERENCE when there is no i18n key", () => {
		const config: DeepPartial<StudioConfig> = {
			features: { enableExport: true },
		};
		expect(stripReactiveConfig(config)).toBe(config);
	});

	it("drops the i18n block and keeps every sibling", () => {
		const config: DeepPartial<StudioConfig> = {
			features: { enableExport: true },
			i18n: { locale: "zh", showLocaleSwitch: true },
		};
		expect(stripReactiveConfig(config)).toEqual({
			features: { enableExport: true },
		});
	});

	it("i18n-only differences fingerprint identically (no recompile)", () => {
		const fingerprint = createConfigFingerprinter();
		const a = fingerprint(stripReactiveConfig({ i18n: { locale: "en" } }));
		const b = fingerprint(stripReactiveConfig({ i18n: { locale: "zh" } }));
		const c = fingerprint(
			stripReactiveConfig({
				i18n: { locale: "zh", showLocaleSwitch: true },
			}),
		);
		expect(a).toBe(b);
		expect(b).toBe(c);
	});

	it("non-i18n differences still change the fingerprint (recompile preserved)", () => {
		const fingerprint = createConfigFingerprinter();
		const a = fingerprint(
			stripReactiveConfig({
				features: { enableExport: false },
				i18n: { locale: "en" },
			}),
		);
		const b = fingerprint(
			stripReactiveConfig({
				features: { enableExport: true },
				i18n: { locale: "en" },
			}),
		);
		expect(a).not.toBe(b);
	});
});

describe("mergeLiveI18n", () => {
	const compiled = (): StudioConfig["i18n"] =>
		StudioConfigSchema.parse({}).i18n;

	it("returns the compiled block by reference for an absent raw partial", () => {
		const base = compiled();
		expect(mergeLiveI18n(base, undefined)).toBe(base);
	});

	it("overlays defined, well-typed keys", () => {
		const next = mergeLiveI18n(compiled(), {
			locale: "zh",
			showLocaleSwitch: true,
			messages: { zh: { "x.k": "你好" } },
		});
		expect(next.locale).toBe("zh");
		expect(next.showLocaleSwitch).toBe(true);
		expect(next.messages).toEqual({ zh: { "x.k": "你好" } });
		// Untouched keys keep their compiled (validated) values.
		expect(next.fallbackLocale).toBe("en");
	});

	it("drops type-mismatched values with a dev warning, keeping the compiled value", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {
			// Swallow the expected dev warnings; the spy counts them.
		});
		const next = mergeLiveI18n(compiled(), {
			locale: "" /* empty string ⇒ invalid */,
			showLocaleSwitch: "yes" as unknown as boolean,
			messages: { zh: { "x.k": 42 } } as unknown as Record<
				string,
				Record<string, string>
			>,
		});
		expect(next.locale).toBe("en");
		expect(next.showLocaleSwitch).toBe(false);
		expect(next.messages).toBeUndefined();
		expect(warn).toHaveBeenCalledTimes(3);
	});

	it("leaves omitted keys alone (undefined is 'not provided', not 'clear')", () => {
		const base = { ...compiled(), locale: "ja" };
		const next = mergeLiveI18n(base, { showLocaleSwitch: true });
		expect(next.locale).toBe("ja");
		expect(next.showLocaleSwitch).toBe(true);
	});
});
