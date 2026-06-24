/**
 * @file Tests for the dev-only missing-i18n-key warning (report 0003, P1-6).
 *
 * `useMsg` resolves an unknown key to the raw key string as a visible
 * fallback. That used to be silent; it now emits a deduped, dev-only
 * `console.warn` so a typo'd or unregistered key is caught in development.
 * The warning fires ONLY when the key resolves to itself (no catalog entry,
 * no override, no caller fallback) AND `NODE_ENV` is an explicit
 * non-production value — never in production or when `NODE_ENV` is unset
 * (e.g. a browser bundle).
 */

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMsg } from "@/state/editor-i18n-context";

describe("useMsg missing-key dev warning", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		// Pin a deterministic dev environment so the warning path is exercised
		// regardless of the ambient NODE_ENV.
		vi.stubEnv("NODE_ENV", "development");
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
			// Swallow the expected dev warning so suite output stays clean.
		});
	});
	afterEach(() => {
		warnSpy.mockRestore();
		vi.unstubAllEnvs();
	});

	it("warns once (deduped) when a key resolves to itself", () => {
		// No provider → null context → DEFAULT_MESSAGES baseline.
		const { result } = renderHook(() => useMsg());
		const key = "studio.__missing_key_dedupe__";

		expect(result.current(key)).toBe(key);
		expect(warnSpy).toHaveBeenCalledTimes(1);
		expect(String(warnSpy.mock.calls[0]?.[0])).toContain(key);

		// Second resolution of the same key must not warn again.
		expect(result.current(key)).toBe(key);
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	it("does not warn when the caller supplies a fallback", () => {
		const { result } = renderHook(() => useMsg());
		expect(
			result.current("studio.__missing_key_with_fallback__", "Default"),
		).toBe("Default");
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("does not warn for a key present in the catalog", () => {
		const { result } = renderHook(() => useMsg());
		expect(result.current("studio.publish")).toBe("Publish");
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("does not warn in production (still renders the raw key)", () => {
		vi.stubEnv("NODE_ENV", "production");
		const { result } = renderHook(() => useMsg());
		const key = "studio.__missing_key_prod__";
		expect(result.current(key)).toBe(key);
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("does not warn when NODE_ENV is unset (browser bundle)", () => {
		vi.stubEnv("NODE_ENV", undefined as unknown as string);
		const { result } = renderHook(() => useMsg());
		const key = "studio.__missing_key_no_env__";
		expect(result.current(key)).toBe(key);
		expect(warnSpy).not.toHaveBeenCalled();
	});
});
