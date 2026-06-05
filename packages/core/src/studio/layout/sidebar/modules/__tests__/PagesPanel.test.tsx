/**
 * @file Tests for `PagesPanel` search/filter behaviour (plan 0004 P4).
 *
 * Covers: search input renders when there are pages, client-side
 * case-insensitive filter on title + path, empty-result EmptyState,
 * active-row preserved across filter changes, and search hidden when
 * the underlying list itself is empty.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { StudioPagesSourceProvider } from "@/context/pages-source";
import { PagesPanel } from "@/layout/sidebar/modules/layer/components/PagesPanel";
import { EditorI18nProvider } from "@/state/index";
import type { StudioPage, StudioPagesSource } from "@/types/pages";

afterEach(cleanup);

function Setup({
	children,
	source,
}: {
	readonly children: ReactNode;
	readonly source?: StudioPagesSource;
}): ReactElement {
	return (
		<EditorI18nProvider>
			<StudioPagesSourceProvider value={source}>
				{children}
			</StudioPagesSourceProvider>
		</EditorI18nProvider>
	);
}

const PAGES: readonly StudioPage[] = [
	{ id: "home", title: "Home", path: "/", active: true },
	{ id: "about", title: "About", path: "/about" },
	{ id: "contact", title: "Contact", path: "/contact" },
	{ id: "blog", title: "Blog", path: "/blog" },
];

describe("PagesPanel — search / filter", () => {
	it("renders the search input when pages exist", async () => {
		const source: StudioPagesSource = { list: () => PAGES };
		render(
			<Setup source={source}>
				<PagesPanel />
			</Setup>,
		);
		expect(await screen.findByTestId("ak-layer-pages-search")).toBeTruthy();
	});

	it("does not render the search input when the list is empty", () => {
		const source: StudioPagesSource = { list: () => [] };
		render(
			<Setup source={source}>
				<PagesPanel />
			</Setup>,
		);
		expect(screen.queryByTestId("ak-layer-pages-search")).toBeNull();
		expect(screen.queryByTestId("ak-layer-pages-empty")).toBeTruthy();
	});

	it("filters by title (case-insensitive)", async () => {
		const source: StudioPagesSource = { list: () => PAGES };
		render(
			<Setup source={source}>
				<PagesPanel />
			</Setup>,
		);
		const search = await screen.findByTestId("ak-layer-pages-search");
		fireEvent.change(search, { target: { value: "blog" } });
		expect(screen.queryByTestId("ak-layer-page-row-blog")).toBeTruthy();
		expect(screen.queryByTestId("ak-layer-page-row-home")).toBeNull();
		expect(screen.queryByTestId("ak-layer-page-row-about")).toBeNull();
	});

	it("filters by path", async () => {
		const source: StudioPagesSource = { list: () => PAGES };
		render(
			<Setup source={source}>
				<PagesPanel />
			</Setup>,
		);
		const search = await screen.findByTestId("ak-layer-pages-search");
		fireEvent.change(search, { target: { value: "/contact" } });
		expect(screen.queryByTestId("ak-layer-page-row-contact")).toBeTruthy();
		expect(screen.queryByTestId("ak-layer-page-row-home")).toBeNull();
	});

	it("renders the search-empty state when no rows match", async () => {
		const source: StudioPagesSource = { list: () => PAGES };
		render(
			<Setup source={source}>
				<PagesPanel />
			</Setup>,
		);
		const search = await screen.findByTestId("ak-layer-pages-search");
		fireEvent.change(search, { target: { value: "nope-xyz" } });
		expect(screen.queryByTestId("ak-layer-pages-search-empty")).toBeTruthy();
		// Original "no pages yet" empty state stays hidden — list isn't empty.
		expect(screen.queryByTestId("ak-layer-pages-empty")).toBeNull();
	});

	it("preserves active row when it matches the filter", async () => {
		const source: StudioPagesSource = { list: () => PAGES };
		render(
			<Setup source={source}>
				<PagesPanel />
			</Setup>,
		);
		const search = await screen.findByTestId("ak-layer-pages-search");
		fireEvent.change(search, { target: { value: "home" } });
		const home = screen.getByTestId("ak-layer-page-row-home");
		expect(home.getAttribute("aria-current")).toBe("page");
	});

	it("clearing the filter restores the full list", async () => {
		const source: StudioPagesSource = { list: () => PAGES };
		render(
			<Setup source={source}>
				<PagesPanel />
			</Setup>,
		);
		const search = await screen.findByTestId("ak-layer-pages-search");
		fireEvent.change(search, { target: { value: "blog" } });
		expect(screen.queryByTestId("ak-layer-page-row-about")).toBeNull();
		fireEvent.change(search, { target: { value: "" } });
		expect(screen.queryByTestId("ak-layer-page-row-home")).toBeTruthy();
		expect(screen.queryByTestId("ak-layer-page-row-about")).toBeTruthy();
		expect(screen.queryByTestId("ak-layer-page-row-contact")).toBeTruthy();
		expect(screen.queryByTestId("ak-layer-page-row-blog")).toBeTruthy();
	});
});

describe("PagesPanel — virtualization", () => {
	function makePages(n: number): StudioPage[] {
		return Array.from({ length: n }, (_, i) => ({
			id: `p-${i}`,
			title: `Page ${i}`,
			path: `/p-${i}`,
		}));
	}

	it("renders rows inline (no virtualization viewport) below the threshold", async () => {
		const source: StudioPagesSource = { list: () => makePages(10) };
		render(
			<Setup source={source}>
				<PagesPanel />
			</Setup>,
		);
		expect(await screen.findByTestId("ak-layer-page-row-p-0")).toBeTruthy();
		expect(screen.queryByTestId("ak-layer-pages-virtualized")).toBeNull();
		expect(
			document.querySelectorAll("[data-testid^='ak-layer-page-row-']").length,
		).toBe(10);
	});

	it("virtualizes a large list to a bounded DOM slice at/above the threshold", async () => {
		const total = 60;
		const source: StudioPagesSource = { list: () => makePages(total) };
		render(
			<Setup source={source}>
				<PagesPanel />
			</Setup>,
		);
		const viewport = await screen.findByTestId("ak-layer-pages-virtualized");
		expect(viewport.getAttribute("data-virtualized")).toBe("true");
		// jsdom reports no layout, so the visible window is a bounded slice —
		// the point is it is never the full dataset.
		expect(
			document.querySelectorAll("[data-testid^='ak-layer-page-row-']").length,
		).toBeLessThan(total);
	});
});
