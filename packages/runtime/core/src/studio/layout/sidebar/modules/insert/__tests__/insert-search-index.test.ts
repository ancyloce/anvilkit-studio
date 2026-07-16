/**
 * @file Tests for the Insert-panel search index + ranking
 * (`insert-search-index.ts`): normalization happens once at
 * index-build time, and ranks order exact > prefix > substring >
 * keyword > description/category, with non-matches excluded.
 */

import { describe, expect, it } from "vitest";

import {
	buildInsertSearchIndex,
	NO_MATCH,
	normalizeInsertQuery,
	rankInsertMatch,
} from "@/layout/sidebar/modules/insert/insert-search-index";

const CONFIG = {
	components: {
		Hero: {
			label: "Hero",
			metadata: {
				description: "A large marketing banner with a call to action.",
				keywords: ["cta", "banner"],
			},
		},
		HeroSplit: { label: "Hero Split" },
		Pricing: {
			label: "Pricing",
			metadata: { description: "Pricing cards with hero pricing tier." },
		},
		Navbar: { label: "Navigation Bar" },
	},
};

const CATEGORIES = new Map([
	["Hero", "marketing"],
	["HeroSplit", "marketing"],
	["Pricing", "marketing"],
	["Navbar", "navigation"],
]);

const NAMES = ["Hero", "HeroSplit", "Pricing", "Navbar"] as const;

function index() {
	return buildInsertSearchIndex([...NAMES], CONFIG, CATEGORIES);
}

describe("normalizeInsertQuery", () => {
	it("trims and lowercases", () => {
		expect(normalizeInsertQuery("  Hero  ")).toBe("hero");
	});
});

describe("rankInsertMatch", () => {
	it("ranks exact title above prefix above substring above keyword above description", () => {
		const idx = index();
		const q = "hero";
		const hero = rankInsertMatch(idx.get("Hero")!, q); // exact title
		const split = rankInsertMatch(idx.get("HeroSplit")!, q); // title prefix
		const pricing = rankInsertMatch(idx.get("Pricing")!, q); // description
		expect(hero).toBe(0);
		expect(split).toBe(1);
		expect(pricing).toBe(4);
		expect(hero).toBeLessThan(split);
		expect(split).toBeLessThan(pricing);
	});

	it("matches keywords at rank 3", () => {
		const idx = index();
		expect(rankInsertMatch(idx.get("Hero")!, "cta")).toBe(3);
	});

	it("matches category text", () => {
		const idx = index();
		expect(rankInsertMatch(idx.get("Navbar")!, "navigation")).toBeLessThan(
			NO_MATCH,
		);
	});

	it("matches the raw component name even when the title differs", () => {
		const idx = index();
		// Title is "Navigation Bar"; raw name is "Navbar".
		expect(rankInsertMatch(idx.get("Navbar")!, "navbar")).toBe(0);
	});

	it("returns NO_MATCH for unrelated queries", () => {
		const idx = index();
		expect(rankInsertMatch(idx.get("Pricing")!, "carousel")).toBe(NO_MATCH);
	});

	it("title substring outranks keyword and description matches", () => {
		const idx = buildInsertSearchIndex(
			["SplitHero", "KeywordOnly"],
			{
				components: {
					SplitHero: { label: "Split Hero" },
					KeywordOnly: {
						label: "Feature Grid",
						metadata: { keywords: ["hero"] },
					},
				},
			},
			new Map(),
		);
		const substring = rankInsertMatch(idx.get("SplitHero")!, "hero");
		const keyword = rankInsertMatch(idx.get("KeywordOnly")!, "hero");
		expect(substring).toBeLessThan(keyword);
	});
});

describe("buildInsertSearchIndex", () => {
	it("indexes every unique name once and survives missing config entries", () => {
		const idx = buildInsertSearchIndex(
			["Hero", "Hero", "Unregistered"],
			CONFIG,
			CATEGORIES,
		);
		expect(idx.size).toBe(2);
		// Unregistered components still match by their raw name.
		expect(rankInsertMatch(idx.get("Unregistered")!, "unregistered")).toBe(0);
	});
});
