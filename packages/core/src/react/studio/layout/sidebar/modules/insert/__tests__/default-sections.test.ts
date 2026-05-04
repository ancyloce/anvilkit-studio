/**
 * @file Tests for the built-in `StudioInsertSection` predicates.
 *
 * Per the Phase C plan Q1 mapping: components whose Puck Config
 * category is `"navigation"` land in the `navigation` section,
 * `"marketing"` lands in `top`, and everything else falls through to
 * the `recommended` catch-all. `team` is intentionally empty by
 * default.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_INSERT_SECTIONS } from "../default-sections";

function findSection(id: string) {
	const section = DEFAULT_INSERT_SECTIONS.find((s) => s.id === id);
	if (section === undefined) {
		throw new Error(`default section ${id} missing`);
	}
	return section;
}

describe("DEFAULT_INSERT_SECTIONS", () => {
	it("ships exactly four sections in PRD order", () => {
		expect(DEFAULT_INSERT_SECTIONS.map((s) => s.id)).toEqual([
			"navigation",
			"top",
			"team",
			"recommended",
		]);
	});

	it("uses i18n keys from the catalog (no hardcoded strings)", () => {
		for (const section of DEFAULT_INSERT_SECTIONS) {
			expect(section.titleKey).toMatch(
				/^studio\.module\.insert\.section\.[a-z]+$/,
			);
		}
	});

	it("orders navigation < top < team < recommended catch-all", () => {
		const orders = DEFAULT_INSERT_SECTIONS.map(
			(s) => s.order ?? Number.POSITIVE_INFINITY,
		);
		const sorted = [...orders].sort((a, b) => a - b);
		expect(orders).toEqual(sorted);
		// `recommended` must sit last so it acts as the fallback under
		// the "first match wins" rule.
		expect(DEFAULT_INSERT_SECTIONS.at(-1)?.id).toBe("recommended");
	});

	describe("navigation predicate", () => {
		const { predicate } = findSection("navigation");
		it("matches components whose category is 'navigation'", () => {
			expect(predicate("Navbar", { category: "navigation" })).toBe(true);
		});
		it("does not match other categories", () => {
			expect(predicate("Hero", { category: "marketing" })).toBe(false);
			expect(predicate("Button", { category: "actions" })).toBe(false);
		});
		it("does not match when metadata is undefined", () => {
			expect(predicate("anything", undefined)).toBe(false);
		});
	});

	describe("top predicate", () => {
		const { predicate } = findSection("top");
		it("matches components whose category is 'marketing'", () => {
			expect(predicate("Hero", { category: "marketing" })).toBe(true);
			expect(predicate("BentoGrid", { category: "marketing" })).toBe(true);
		});
		it("does not match other categories", () => {
			expect(predicate("Navbar", { category: "navigation" })).toBe(false);
		});
	});

	describe("team predicate", () => {
		const { predicate } = findSection("team");
		it("returns false for everything (empty by default)", () => {
			expect(predicate("Anyone", { category: "team" })).toBe(false);
			expect(predicate("Anyone", { category: "marketing" })).toBe(false);
			expect(predicate("Anyone", undefined)).toBe(false);
		});
	});

	describe("recommended predicate", () => {
		const { predicate } = findSection("recommended");
		it("matches anything as a catch-all", () => {
			expect(predicate("Button", { category: "actions" })).toBe(true);
			expect(predicate("Input", { category: "forms" })).toBe(true);
			expect(predicate("UnknownThing", undefined)).toBe(true);
		});
	});
});
