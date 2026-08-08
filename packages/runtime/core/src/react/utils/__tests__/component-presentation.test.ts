/**
 * @file Tests for `readComponentPresentation` / `matchesPresentationQuery`
 * (task Phase 9).
 */

import { describe, expect, it } from "vitest";
import {
	matchesPresentationQuery,
	readComponentPresentation,
} from "@/overrides/utils/component-presentation";

describe("readComponentPresentation", () => {
	it("falls back to the raw component name when there is no config at all", () => {
		const result = readComponentPresentation(undefined, "Hero");
		expect(result).toEqual({ title: "Hero" });
	});

	it("uses label as the title when present", () => {
		const result = readComponentPresentation({ label: "Hero Banner" }, "Hero");
		expect(result.title).toBe("Hero Banner");
	});

	it("falls back to name when metadata has no presentation fields (every existing component today)", () => {
		const result = readComponentPresentation(
			{
				label: "Hero",
				metadata: {
					componentName: "Hero",
					suggestedCategory: "marketing",
				},
			},
			"Hero",
		);
		expect(result).toEqual({ title: "Hero" });
	});

	it("reads description, thumbnail, and keywords from metadata when a component opts in", () => {
		const result = readComponentPresentation(
			{
				label: "Hero",
				metadata: {
					description: "A large marketing banner with a CTA.",
					thumbnail: "https://example.com/hero.png",
					keywords: ["banner", "cta", "marketing"],
				},
			},
			"Hero",
		);
		expect(result.description).toBe("A large marketing banner with a CTA.");
		expect(result.thumbnail).toBe("https://example.com/hero.png");
		expect(result.keywords).toEqual(["banner", "cta", "marketing"]);
	});

	it("ignores non-string keywords entries and empty arrays", () => {
		const result = readComponentPresentation(
			{ metadata: { keywords: ["ok", 42, null, ""] } },
			"Hero",
		);
		expect(result.keywords).toEqual(["ok"]);

		const empty = readComponentPresentation(
			{ metadata: { keywords: [] } },
			"Hero",
		);
		expect(empty.keywords).toBeUndefined();
	});

	it("ignores a non-object metadata value instead of throwing", () => {
		const result = readComponentPresentation(
			{ label: "Hero", metadata: "not-an-object" as never },
			"Hero",
		);
		expect(result).toEqual({ title: "Hero" });
	});
});

describe("matchesPresentationQuery", () => {
	const presentation = {
		title: "Hero Banner",
		description: "A large marketing banner with a CTA.",
		keywords: ["cta", "marketing"] as readonly string[],
	};

	it("matches everything for an empty query", () => {
		expect(matchesPresentationQuery(presentation, "Hero", "")).toBe(true);
	});

	it("matches the raw component name", () => {
		expect(matchesPresentationQuery(presentation, "Hero", "hero")).toBe(true);
	});

	it("matches the title", () => {
		expect(matchesPresentationQuery(presentation, "Hero", "banner")).toBe(true);
	});

	it("matches the description", () => {
		expect(matchesPresentationQuery(presentation, "Hero", "marketing")).toBe(
			true,
		);
	});

	it("matches a keyword", () => {
		expect(matchesPresentationQuery(presentation, "Hero", "cta")).toBe(true);
	});

	it("does not match an unrelated query", () => {
		expect(matchesPresentationQuery(presentation, "Hero", "pricing")).toBe(
			false,
		);
	});
});
