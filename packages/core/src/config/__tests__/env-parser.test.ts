/**
 * @file Tests for `parseStudioEnv` (Layer 2 of the config layering
 * model, `core-011`).
 *
 * Coverage targets every rule the file header documents:
 *
 * - Only `ANVILKIT_`-prefixed keys are consumed; anything else is
 *   skipped without error.
 * - The `__` separator maps to nested object paths.
 * - Each segment is SCREAMING_SNAKE → camelCase.
 * - Value coercion: boolean aliases (`"true"`, `"1"`, `"false"`,
 *   `"0"`) win over numbers; finite numbers are parsed; empty /
 *   whitespace / `"NaN"` / `"Infinity"` stay strings.
 * - The function is pure — it never mutates the input bag and never
 *   touches `process.env` when an explicit bag is passed.
 *
 * All tests pass synthetic env bags so no `process.env` is ever read.
 */

import { describe, expect, it } from "vitest";

import { parseStudioEnv } from "../env-parser.js";

describe("parseStudioEnv — prefix filtering", () => {
	it("returns an empty object when no key matches the prefix", () => {
		const result = parseStudioEnv({
			HOME: "/root",
			PATH: "/usr/bin",
			FOO: "bar",
		});
		expect(result).toEqual({});
	});

	it("skips keys that start with the wrong prefix", () => {
		const result = parseStudioEnv({
			ANVILKITX_THEME__DEFAULT_MODE: "dark",
			ANVIL_THEME__DEFAULT_MODE: "dark",
		});
		expect(result).toEqual({});
	});

	it("consumes keys that start with `ANVILKIT_`", () => {
		const result = parseStudioEnv({
			ANVILKIT_THEME__DEFAULT_MODE: "dark",
		});
		expect(result).toEqual({ theme: { defaultMode: "dark" } });
	});

	it("skips the bare `ANVILKIT_` key (empty tail)", () => {
		const result = parseStudioEnv({ ANVILKIT_: "anything" });
		expect(result).toEqual({});
	});

	it("silently skips entries whose value is `undefined`", () => {
		const result = parseStudioEnv({
			ANVILKIT_THEME__DEFAULT_MODE: undefined,
		});
		expect(result).toEqual({});
	});
});

describe("parseStudioEnv — nested-path separator", () => {
	it("splits on `__` into nested levels", () => {
		const result = parseStudioEnv({
			ANVILKIT_FEATURES__ENABLE_EXPORT: "true",
		});
		expect(result).toEqual({ features: { enableExport: true } });
	});

	it("handles three-level paths", () => {
		// `experimental` is a grab-bag record, so an arbitrary
		// two-level descendant is a realistic test case.
		const result = parseStudioEnv({
			ANVILKIT_EXPERIMENTAL__MY_GROUP__SUB_FLAG: "true",
		});
		expect(result).toEqual({
			experimental: { myGroup: { subFlag: true } },
		});
	});

	it("merges sibling keys under a shared parent", () => {
		const result = parseStudioEnv({
			ANVILKIT_THEME__DEFAULT_MODE: "dark",
			ANVILKIT_THEME__ALLOW_TOGGLE: "false",
		});
		expect(result).toEqual({
			theme: { defaultMode: "dark", allowToggle: false },
		});
	});

	it("skips malformed keys with empty segments", () => {
		// Four underscores in a row → one empty segment in the split.
		// Treat the whole entry as malformed and drop it rather than
		// guess intent.
		const result = parseStudioEnv({
			ANVILKIT_FOO____BAR: "true",
		});
		expect(result).toEqual({});
	});
});

describe("parseStudioEnv — segment camelCase conversion", () => {
	it("lowercases a single-word segment", () => {
		const result = parseStudioEnv({
			ANVILKIT_FEATURES__ENABLE_AI: "true",
		});
		expect(result).toEqual({ features: { enableAi: true } });
	});

	it("camelCases multi-word segments", () => {
		const result = parseStudioEnv({
			ANVILKIT_AI__DEFAULT_MODEL: "claude-opus-4-6",
		});
		expect(result).toEqual({ ai: { defaultModel: "claude-opus-4-6" } });
	});

	it("handles segments with digits", () => {
		const result = parseStudioEnv({
			ANVILKIT_EXPERIMENTAL__FOO_2_BAR: "x",
		});
		expect(result).toEqual({ experimental: { foo2Bar: "x" } });
	});
});

describe("parseStudioEnv — value coercion", () => {
	it('coerces "true" and "1" to boolean true', () => {
		const result = parseStudioEnv({
			ANVILKIT_FEATURES__ENABLE_EXPORT: "true",
			ANVILKIT_FEATURES__ENABLE_AI: "1",
		});
		expect(result.features?.enableExport).toBe(true);
		expect(result.features?.enableAi).toBe(true);
	});

	it('coerces "false" and "0" to boolean false', () => {
		const result = parseStudioEnv({
			ANVILKIT_FEATURES__ENABLE_EXPORT: "false",
			ANVILKIT_FEATURES__ENABLE_AI: "0",
		});
		expect(result.features?.enableExport).toBe(false);
		expect(result.features?.enableAi).toBe(false);
	});

	it("coerces finite integers to numbers", () => {
		const result = parseStudioEnv({
			ANVILKIT_AI__MAX_RETRIES: "5",
		});
		expect(result.ai?.maxRetries).toBe(5);
	});

	it("coerces finite floats to numbers", () => {
		const result = parseStudioEnv({
			ANVILKIT_EXPERIMENTAL__RATIO: "2.5",
		});
		expect(result.experimental?.ratio).toBe(2.5);
	});

	it("coerces negative numbers", () => {
		const result = parseStudioEnv({
			ANVILKIT_EXPERIMENTAL__OFFSET: "-7",
		});
		expect(result.experimental?.offset).toBe(-7);
	});

	it('does not coerce "NaN" or "Infinity" to numbers', () => {
		const result = parseStudioEnv({
			ANVILKIT_EXPERIMENTAL__A: "NaN",
			ANVILKIT_EXPERIMENTAL__B: "Infinity",
			ANVILKIT_EXPERIMENTAL__C: "-Infinity",
		});
		expect(result.experimental?.a).toBe("NaN");
		expect(result.experimental?.b).toBe("Infinity");
		expect(result.experimental?.c).toBe("-Infinity");
	});

	it("does not coerce empty or whitespace-only strings to 0", () => {
		// `Number("")` and `Number("  ")` both yield 0; the parser
		// must guard against that or empty env vars would silently
		// become numeric zeros.
		const result = parseStudioEnv({
			ANVILKIT_EXPERIMENTAL__EMPTY: "",
			ANVILKIT_EXPERIMENTAL__SPACES: "   ",
		});
		expect(result.experimental?.empty).toBe("");
		expect(result.experimental?.spaces).toBe("   ");
	});

	it("keeps arbitrary strings unchanged", () => {
		const result = parseStudioEnv({
			ANVILKIT_BRANDING__APP_NAME: "Custom Studio",
		});
		expect(result.branding?.appName).toBe("Custom Studio");
	});
});

describe("parseStudioEnv — purity", () => {
	it("does not mutate the input bag", () => {
		const env = {
			ANVILKIT_THEME__DEFAULT_MODE: "dark",
			HOME: "/root",
		};
		const snapshot = { ...env };
		parseStudioEnv(env);
		expect(env).toEqual(snapshot);
	});

	it("returns a fresh object on every call", () => {
		const env = { ANVILKIT_THEME__DEFAULT_MODE: "dark" };
		const first = parseStudioEnv(env);
		const second = parseStudioEnv(env);
		expect(first).not.toBe(second);
		expect(first).toEqual(second);
	});

	it("accepts an empty bag without throwing", () => {
		expect(parseStudioEnv({})).toEqual({});
	});
});
