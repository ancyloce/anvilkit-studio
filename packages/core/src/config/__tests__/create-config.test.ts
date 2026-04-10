/**
 * @file Tests for `createStudioConfig` — the layered Studio config
 * factory (`core-011`).
 *
 * Coverage targets:
 *
 * - No-argument equivalence with `StudioConfigSchema.parse({})`.
 * - Partial host overrides merge field-by-field with defaults.
 * - Env bag overrides apply on top of defaults.
 * - Layer precedence: Layer 3 (overrides) beats Layer 2 (env) beats
 *   Layer 1 (defaults).
 * - `deepMerge`'s array-replace semantics survive the round trip
 *   (a host override of `experimental.plugins: ["a", "b"]` replaces,
 *   not concatenates, the defaults).
 * - Validation failures are wrapped in `StudioConfigError` with a
 *   message that names the offending field path.
 * - The underlying `ZodError` is attached via the ES2022 `cause`
 *   field so host apps can drill in for structured access.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { StudioConfigError } from "../../runtime/errors.js";
import type { StudioConfig } from "../../types/config.js";
import { createStudioConfig } from "../create-config.js";
import { StudioConfigSchema } from "../schema.js";

describe("createStudioConfig — no-argument equivalence", () => {
	it("returns the same shape as StudioConfigSchema.parse({}) with no args", () => {
		// Empty env bag so the comparison does not depend on the
		// ambient process env.
		const config = createStudioConfig(undefined, { env: {} });
		const defaults = StudioConfigSchema.parse({});
		expect(config).toEqual(defaults);
	});

	it("accepts an undefined overrides argument", () => {
		const config = createStudioConfig(undefined, { env: {} });
		expect(config.theme.defaultMode).toBe("system");
		expect(config.features.enableExport).toBe(false);
	});

	it("accepts an empty-object overrides argument", () => {
		const config = createStudioConfig({}, { env: {} });
		expect(config.branding.appName).toBe("AnvilKit Studio");
	});
});

describe("createStudioConfig — Layer 3 (host overrides)", () => {
	it("applies a partial override without touching sibling defaults", () => {
		const config = createStudioConfig(
			{ features: { enableExport: true } },
			{ env: {} },
		);

		expect(config.features.enableExport).toBe(true);
		// Sibling flags fall back to defaults.
		expect(config.features.enableAi).toBe(false);
		expect(config.features.enableCollaboration).toBe(false);
		// Untouched sections stay at their defaults.
		expect(config.theme.defaultMode).toBe("system");
		expect(config.branding.appName).toBe("AnvilKit Studio");
	});

	it("applies overrides across multiple sections in one call", () => {
		const config = createStudioConfig(
			{
				features: { enableAi: true },
				theme: { defaultMode: "dark" },
				ai: { defaultModel: "claude-opus-4-6" },
			},
			{ env: {} },
		);

		expect(config.features.enableAi).toBe(true);
		expect(config.theme.defaultMode).toBe("dark");
		expect(config.ai.defaultModel).toBe("claude-opus-4-6");
		// Untouched fields inside the same section still default.
		expect(config.theme.allowToggle).toBe(true);
		expect(config.ai.maxRetries).toBe(3);
	});
});

describe("createStudioConfig — Layer 2 (env vars)", () => {
	it("applies an env override on top of defaults", () => {
		const config = createStudioConfig(undefined, {
			env: { ANVILKIT_THEME__DEFAULT_MODE: "dark" },
		});
		expect(config.theme.defaultMode).toBe("dark");
		// Untouched fields still default.
		expect(config.theme.allowToggle).toBe(true);
	});

	it("coerces env string values to the types the schema expects", () => {
		const config = createStudioConfig(undefined, {
			env: {
				ANVILKIT_FEATURES__ENABLE_EXPORT: "true",
				ANVILKIT_AI__MAX_RETRIES: "5",
			},
		});
		expect(config.features.enableExport).toBe(true);
		expect(config.ai.maxRetries).toBe(5);
	});

	it("ignores env vars that do not match the prefix", () => {
		const config = createStudioConfig(undefined, {
			env: {
				HOME: "/root",
				PATH: "/usr/bin",
			},
		});
		// No changes from defaults.
		expect(config).toEqual(StudioConfigSchema.parse({}));
	});
});

describe("createStudioConfig — layer precedence", () => {
	it("Layer 3 (overrides) beats Layer 2 (env)", () => {
		const config = createStudioConfig(
			{ theme: { defaultMode: "light" } },
			{ env: { ANVILKIT_THEME__DEFAULT_MODE: "dark" } },
		);
		expect(config.theme.defaultMode).toBe("light");
	});

	it("Layer 2 (env) beats Layer 1 (defaults)", () => {
		const config = createStudioConfig(undefined, {
			env: { ANVILKIT_THEME__DEFAULT_MODE: "dark" },
		});
		// Default is "system" — env bumped it to "dark".
		expect(config.theme.defaultMode).toBe("dark");
	});

	it("Layer 3 (overrides) beats Layer 1 (defaults) with no env in play", () => {
		const config = createStudioConfig(
			{ theme: { defaultMode: "light" } },
			{ env: {} },
		);
		expect(config.theme.defaultMode).toBe("light");
	});

	it("does a full three-layer merge with distinct fields at each layer", () => {
		const config = createStudioConfig(
			{ features: { enableAi: true } },
			{
				env: {
					ANVILKIT_THEME__DEFAULT_MODE: "dark",
					// Overridden by Layer 3:
					ANVILKIT_FEATURES__ENABLE_AI: "false",
					// Survives from Layer 2:
					ANVILKIT_FEATURES__ENABLE_EXPORT: "true",
				},
			},
		);

		// Layer 1: default branding.
		expect(config.branding.appName).toBe("AnvilKit Studio");
		// Layer 2: theme.defaultMode and features.enableExport.
		expect(config.theme.defaultMode).toBe("dark");
		expect(config.features.enableExport).toBe(true);
		// Layer 3: features.enableAi (overriding the env's "false").
		expect(config.features.enableAi).toBe(true);
	});
});

describe("createStudioConfig — deepMerge array semantics", () => {
	it("replaces arrays under `experimental` rather than concatenating", () => {
		// `experimental` is a free-form Record<string, unknown>, so
		// it is the only place in the schema where array values
		// round-trip cleanly. Exercise the replace-not-concat rule
		// through the full factory.
		const config = createStudioConfig(
			{ experimental: { plugins: ["alpha", "beta"] } },
			{ env: {} },
		);
		expect(config.experimental.plugins).toEqual(["alpha", "beta"]);
	});

	it("a later override fully replaces an earlier array", () => {
		// Two successive createStudioConfig calls cannot share
		// state, so simulate "earlier layer provides an array" by
		// passing it through the env (which becomes Layer 2) and
		// overriding through Layer 3.
		const config = createStudioConfig(
			{ experimental: { tags: ["kept"] } },
			{
				env: {
					// env parser emits a string, not an array — so
					// this test specifically validates the case
					// where Layer 2 is a non-array and Layer 3 is.
					// Layer 3 still wins.
					ANVILKIT_EXPERIMENTAL__TAGS: "ignored",
				},
			},
		);
		expect(config.experimental.tags).toEqual(["kept"]);
	});
});

describe("createStudioConfig — validation failures", () => {
	it("wraps a bad enum value in StudioConfigError", () => {
		expect(() =>
			createStudioConfig(
				// Cast through `unknown` to bypass the compile-time
				// guard and reach the runtime validation path.
				{ theme: { defaultMode: "sepia" as unknown as "dark" } },
				{ env: {} },
			),
		).toThrowError(StudioConfigError);
	});

	it("the thrown error's message contains the offending field path", () => {
		try {
			createStudioConfig(
				{ theme: { defaultMode: "sepia" as unknown as "dark" } },
				{ env: {} },
			);
			throw new Error("expected createStudioConfig to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(StudioConfigError);
			if (error instanceof StudioConfigError) {
				expect(error.message).toContain("StudioConfig validation failed");
				expect(error.message).toContain("theme.defaultMode");
			}
		}
	});

	it("attaches the underlying ZodError via the cause field", () => {
		try {
			createStudioConfig(
				{ ai: { maxRetries: 999 } },
				{ env: {} },
			);
			throw new Error("expected createStudioConfig to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(StudioConfigError);
			if (error instanceof StudioConfigError) {
				expect(error.cause).toBeInstanceOf(z.ZodError);
			}
		}
	});

	it("rejects an unknown top-level key from Layer 3 overrides", () => {
		expect(() =>
			createStudioConfig(
				// Cast is necessary because the TS type forbids
				// unknown keys, but we're exercising the runtime
				// guard that catches the same mistake from a JS host.
				{ nonsense: { value: 1 } } as unknown as Partial<StudioConfig>,
				{ env: {} },
			),
		).toThrowError(StudioConfigError);
	});

	it("rejects an unknown top-level key from Layer 2 env vars", () => {
		expect(() =>
			createStudioConfig(undefined, {
				env: { ANVILKIT_NONSENSE_KEY: "value" },
			}),
		).toThrowError(StudioConfigError);
	});

	it("rejects a coerced type that fails a validator (maxRetries > 10)", () => {
		// Env coercion produces `11`, which is a valid integer but
		// outside the `[0, 10]` range enforced by the schema. The
		// re-parse catches it.
		expect(() =>
			createStudioConfig(undefined, {
				env: { ANVILKIT_AI__MAX_RETRIES: "11" },
			}),
		).toThrowError(StudioConfigError);
	});
});
