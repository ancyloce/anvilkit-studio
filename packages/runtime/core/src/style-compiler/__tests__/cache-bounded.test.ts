/**
 * @file Regression tests for review 0036 M-8 — the appearance-compiler
 * cache must be bounded.
 *
 * It was a bare `Map` with no eviction, no size limit and no `clear`,
 * while `AnvilKitRender` recommended "a module-level instance in a
 * server route". Entries validate by object identity, so a server that
 * deserializes a document per request can never hit one — the cache
 * grew one entry per node per document, forever, and read back nothing.
 */

import type {
	DesignSystem,
	TargetAppearance,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	type CompiledTargetFragment,
	createAppearanceCompilerCache,
	DEFAULT_APPEARANCE_CACHE_ENTRIES,
} from "../cache.js";

const designSystem = {} as DesignSystem;

function fragment(rule: string): CompiledTargetFragment {
	return {
		appearance: undefined as TargetAppearance | undefined,
		designSystem,
		tokenMode: "default",
		rulesByLayer: [["base", rule]],
		diagnostics: [],
	};
}

describe("createAppearanceCompilerCache — bounded (0036 M-8)", () => {
	it("stops growing at its ceiling", () => {
		const cache = createAppearanceCompilerCache(10);
		for (let i = 0; i < 1000; i += 1) {
			cache.set(`node-${i}`, fragment(`.r${i}{}`));
		}
		// Before the fix this was 1000 — and unbounded beyond it.
		expect(cache.size).toBe(10);
	});

	it("evicts the least recently used entry", () => {
		const cache = createAppearanceCompilerCache(3);
		cache.set("a", fragment(".a{}"));
		cache.set("b", fragment(".b{}"));
		cache.set("c", fragment(".c{}"));

		// Touch `a`, making `b` the least recently used.
		expect(cache.get("a")).toBeDefined();
		cache.set("d", fragment(".d{}"));

		expect(cache.has("b")).toBe(false);
		expect(cache.has("a")).toBe(true);
		expect(cache.has("c")).toBe(true);
		expect(cache.has("d")).toBe(true);
	});

	it("refreshes recency on write without growing", () => {
		const cache = createAppearanceCompilerCache(2);
		cache.set("a", fragment(".a{}"));
		cache.set("b", fragment(".b{}"));
		cache.set("a", fragment(".a2{}"));
		expect(cache.size).toBe(2);
		expect(cache.get("a")?.rulesByLayer[0]?.[1]).toBe(".a2{}");

		cache.set("c", fragment(".c{}"));
		// `b` was the oldest touch, so it goes — not the re-written `a`.
		expect(cache.has("b")).toBe(false);
		expect(cache.has("a")).toBe(true);
	});

	it("round-trips a value like the Map it still is", () => {
		const cache = createAppearanceCompilerCache();
		const entry = fragment(".x{}");
		cache.set("x", entry);
		expect(cache.get("x")).toBe(entry);
		expect(cache.get("missing")).toBeUndefined();
		expect(cache).toBeInstanceOf(Map);
	});

	it("defaults to a sane ceiling", () => {
		expect(DEFAULT_APPEARANCE_CACHE_ENTRIES).toBeGreaterThan(1000);
		const cache = createAppearanceCompilerCache();
		cache.set("a", fragment(".a{}"));
		expect(cache.size).toBe(1);
	});
});
