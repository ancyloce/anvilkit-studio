/**
 * @file Tests for `computeReorderIndex` (plan 0004 P5).
 *
 * Pure index-math coverage — the surrounding `usePagesDnd` hook is
 * exercised end-to-end via `PagesPanel` integration; this file pins
 * the math the host's `onReorder({ id, toIndex })` payload depends
 * on.
 */

import { describe, expect, it } from "vitest";
import { computeReorderIndex } from "../use-pages-dnd";
import type { StudioPage } from "@/types/pages";

const PAGES: readonly StudioPage[] = [
	{ id: "home", title: "Home" },
	{ id: "about", title: "About" },
	{ id: "contact", title: "Contact" },
	{ id: "blog", title: "Blog" },
];

describe("computeReorderIndex", () => {
	it("returns the destination index when dropping onto another row", () => {
		// Dragging "home" onto "contact" → toIndex 2.
		expect(computeReorderIndex(PAGES, "home", "contact")).toBe(2);
	});

	it("returns null when active and over are the same id (drop onto self)", () => {
		expect(computeReorderIndex(PAGES, "about", "about")).toBeNull();
	});

	it("returns null when over is null (drop outside any row)", () => {
		expect(computeReorderIndex(PAGES, "about", null)).toBeNull();
	});

	it("returns null when the over id is not in the list", () => {
		expect(computeReorderIndex(PAGES, "about", "ghost")).toBeNull();
	});

	it("returns null when the active id is not in the list", () => {
		expect(computeReorderIndex(PAGES, "ghost", "about")).toBeNull();
	});

	it("supports moving upward", () => {
		// Dragging "blog" (idx 3) onto "home" (idx 0) → toIndex 0.
		expect(computeReorderIndex(PAGES, "blog", "home")).toBe(0);
	});

	it("supports moving downward", () => {
		// Dragging "home" onto "blog" → toIndex 3.
		expect(computeReorderIndex(PAGES, "home", "blog")).toBe(3);
	});

	it("returns null on an empty list", () => {
		expect(computeReorderIndex([], "anything", "anything-else")).toBeNull();
	});
});
