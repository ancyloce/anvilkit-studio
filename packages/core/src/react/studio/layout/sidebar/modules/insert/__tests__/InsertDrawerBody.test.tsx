/**
 * @file Tests for {@link InsertDrawerBody} (PRD §5).
 *
 * Mocks `@puckeditor/core`'s `useGetPuck` to expose a minimal Config
 * with `categories`, then drives the body with synthetic Drawer.Items
 * (plain `<button name="...">` elements) to verify:
 *
 * - Sectioned rendering by predicate (first-match-wins, ordered).
 * - Empty sections are hidden, not rendered with a per-section message.
 * - Search filters into a flat result list (no sections).
 * - Search-empty surfaces the dedicated empty state.
 * - Library-empty surfaces the dedicated empty state.
 * - View toggle drives the tile container.
 *
 * The Drawer.Item-style children carry a `name` prop, mirroring how
 * Puck supplies them to the `drawer` override in production.
 */

import type { Config as PuckConfig } from "@puckeditor/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import { type ReactElement, type ReactNode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_INSERT_SECTIONS } from "@/layout/sidebar/modules/insert/default-sections";
import { InsertDrawerBody } from "@/layout/sidebar/modules/insert/InsertDrawerBody";
import { Button } from "@/primitives/button";
import {
	createSidebarRegistryStore,
	EditorI18nStoreProvider,
	EditorUiStoreProvider,
	SidebarRegistryProvider,
	type SidebarRegistryStoreApi,
	useEditorUiStore,
} from "@/state/index";
import type { StudioInsertSection } from "@/types/sidebar";

const FAKE_CONFIG: PuckConfig = {
	categories: {
		navigation: { components: ["Navbar"] },
		marketing: { components: ["Hero", "BentoGrid"] },
		actions: { components: ["Button"] },
		forms: { components: ["Input"] },
	},
	components: {},
} as unknown as PuckConfig;

vi.mock("@puckeditor/core", async () => {
	const actual = (await vi.importActual<Record<string, unknown>>(
		"@puckeditor/core",
	)) as Record<string, unknown>;
	return {
		...actual,
		useGetPuck: () => () => ({ config: FAKE_CONFIG }),
	};
});

afterEach(cleanup);

interface FakeDrawerItemProps {
	readonly name: string;
}

interface FakePuckCategoryProps {
	readonly title: string;
	readonly children: ReactNode;
}

function FakeDrawerItem({ name }: FakeDrawerItemProps): ReactElement {
	// Mirrors the shape Puck's `<Drawer.Item>` exposes — a button-ish
	// element with a `name` prop the override reads. The DOM markup is
	// kept simple because the tests only care about *which* items end
	// up in *which* section, not Puck's internal drag handle wiring.
	return (
		<Button type="button" data-testid={`item-${name}`}>
			{name}
		</Button>
	);
}

function FakePuckCategory({
	title,
	children,
}: FakePuckCategoryProps): ReactElement {
	return (
		<section data-testid={`category-${title}`}>
			<h3>{title}</h3>
			{children}
		</section>
	);
}

interface ProvidersProps {
	readonly registry?: SidebarRegistryStoreApi;
	readonly children: ReactNode;
}

function Providers({ registry, children }: ProvidersProps): ReactElement {
	const store = registry ?? createSidebarRegistryStoreWithDefaults();
	return (
		<EditorI18nStoreProvider>
			<EditorUiStoreProvider
				storeId={`test-${Math.random().toString(36).slice(2)}`}
			>
				<SidebarRegistryProvider value={store}>
					{children}
				</SidebarRegistryProvider>
			</EditorUiStoreProvider>
		</EditorI18nStoreProvider>
	);
}

function createSidebarRegistryStoreWithDefaults(): SidebarRegistryStoreApi {
	const store = createSidebarRegistryStore();
	for (const section of DEFAULT_INSERT_SECTIONS) {
		store.getState().registerInsertSection(section);
	}
	return store;
}

function demoItems(): ReadonlyArray<ReactElement> {
	// Direct leaf shape used by older Puck renders and by consumer
	// overrides that hand Studio already-flattened drawer items.
	return [
		<FakeDrawerItem key="Navbar" name="Navbar" />,
		<FakeDrawerItem key="Hero" name="Hero" />,
		<FakeDrawerItem key="BentoGrid" name="BentoGrid" />,
		<FakeDrawerItem key="Button" name="Button" />,
		<FakeDrawerItem key="Input" name="Input" />,
	];
}

function categorizedDemoItems(): ReadonlyArray<ReactElement> {
	return [
		<FakePuckCategory key="navigation" title="NAVIGATION">
			<FakeDrawerItem name="Navbar" />
		</FakePuckCategory>,
		<FakePuckCategory key="marketing" title="MARKETING">
			<FakeDrawerItem name="Hero" />
			<FakeDrawerItem name="BentoGrid" />
		</FakePuckCategory>,
		<FakePuckCategory key="actions" title="ACTIONS">
			<FakeDrawerItem name="Button" />
		</FakePuckCategory>,
		<FakePuckCategory key="forms" title="FORMS">
			<FakeDrawerItem name="Input" />
		</FakePuckCategory>,
	];
}

describe("InsertDrawerBody", () => {
	it("groups items into navigation / top / recommended by predicate (team hidden when empty)", () => {
		render(
			<Providers>
				<InsertDrawerBody>{demoItems()}</InsertDrawerBody>
			</Providers>,
		);

		const navigation = screen.getByTestId("ak-insert-section-navigation");
		const top = screen.getByTestId("ak-insert-section-top");
		const recommended = screen.getByTestId("ak-insert-section-recommended");

		// Navigation: only Navbar.
		expect(
			navigation.querySelector('[data-testid="item-Navbar"]'),
		).toBeTruthy();
		expect(navigation.querySelector('[data-testid="item-Hero"]')).toBeNull();

		// Top: marketing components.
		expect(top.querySelector('[data-testid="item-Hero"]')).toBeTruthy();
		expect(top.querySelector('[data-testid="item-BentoGrid"]')).toBeTruthy();

		// Recommended catch-all: Button + Input.
		expect(
			recommended.querySelector('[data-testid="item-Button"]'),
		).toBeTruthy();
		expect(
			recommended.querySelector('[data-testid="item-Input"]'),
		).toBeTruthy();

		// Team has zero matches → not rendered.
		expect(screen.queryByTestId("ak-insert-section-team")).toBeNull();
	});

	it("flattens Puck category wrappers before rendering Studio sections", () => {
		render(
			<Providers>
				<InsertDrawerBody>{categorizedDemoItems()}</InsertDrawerBody>
			</Providers>,
		);

		expect(screen.queryByText("NAVIGATION")).toBeNull();
		expect(screen.queryByText("MARKETING")).toBeNull();
		expect(screen.queryByText("ACTIONS")).toBeNull();

		const navigation = screen.getByTestId("ak-insert-section-navigation");
		const top = screen.getByTestId("ak-insert-section-top");
		const recommended = screen.getByTestId("ak-insert-section-recommended");

		expect(
			navigation.querySelector('[data-testid="item-Navbar"]'),
		).toBeTruthy();
		expect(top.querySelector('[data-testid="item-Hero"]')).toBeTruthy();
		expect(top.querySelector('[data-testid="item-BentoGrid"]')).toBeTruthy();
		expect(
			recommended.querySelector('[data-testid="item-Button"]'),
		).toBeTruthy();
		expect(
			recommended.querySelector('[data-testid="item-Input"]'),
		).toBeTruthy();
	});

	it("renders the library-empty state when no Drawer.Items are provided", () => {
		render(
			<Providers>
				<InsertDrawerBody>{null}</InsertDrawerBody>
			</Providers>,
		);
		expect(screen.getByTestId("ak-insert-empty-library")).toBeTruthy();
	});

	it("flattens results and hides sections while a search query is active", () => {
		// Pre-set the drawer search via a small writer component so we
		// don't depend on the InsertSearchBar's debounce.
		function PrimeSearch({ query }: { readonly query: string }): null {
			const setQuery = useEditorUiStore((s) => s.setDrawerSearch);
			useEffect(() => {
				setQuery(query);
			}, [setQuery, query]);
			return null;
		}

		render(
			<Providers>
				<PrimeSearch query="but" />
				<InsertDrawerBody>{demoItems()}</InsertDrawerBody>
			</Providers>,
		);

		// Section nodes are gone — flat list only.
		expect(screen.queryByTestId("ak-insert-section-navigation")).toBeNull();
		expect(screen.queryByTestId("ak-insert-section-recommended")).toBeNull();
		// Button (matches `but`) is rendered; Hero is not.
		expect(screen.getByTestId("item-Button")).toBeTruthy();
		expect(screen.queryByTestId("item-Hero")).toBeNull();
	});

	it("renders the search-empty state when a query yields zero matches", () => {
		function PrimeSearch({ query }: { readonly query: string }): null {
			const setQuery = useEditorUiStore((s) => s.setDrawerSearch);
			useEffect(() => {
				setQuery(query);
			}, [setQuery, query]);
			return null;
		}

		render(
			<Providers>
				<PrimeSearch query="zzznomatch" />
				<InsertDrawerBody>{demoItems()}</InsertDrawerBody>
			</Providers>,
		);
		expect(screen.getByTestId("ak-insert-empty-search")).toBeTruthy();
	});

	it("uses the grid container in grid view mode and the list container in list view mode", () => {
		function PrimeView({ mode }: { readonly mode: "grid" | "list" }): null {
			const setMode = useEditorUiStore((s) => s.setComponentViewMode);
			useEffect(() => {
				setMode(mode);
			}, [setMode, mode]);
			return null;
		}

		const { rerender } = render(
			<Providers>
				<PrimeView mode="grid" />
				<InsertDrawerBody>{demoItems()}</InsertDrawerBody>
			</Providers>,
		);
		expect(
			screen.queryAllByTestId("ak-insert-tile-grid").length,
		).toBeGreaterThan(0);
		expect(screen.queryAllByTestId("ak-insert-tile-list").length).toBe(0);

		rerender(
			<Providers>
				<PrimeView mode="list" />
				<InsertDrawerBody>{demoItems()}</InsertDrawerBody>
			</Providers>,
		);
		expect(
			screen.queryAllByTestId("ak-insert-tile-list").length,
		).toBeGreaterThan(0);
		expect(screen.queryAllByTestId("ak-insert-tile-grid").length).toBe(0);
	});

	it("applies the first-match-wins rule when a custom plugin section overlaps the defaults", () => {
		const registry = createSidebarRegistryStoreWithDefaults();
		const customSection: StudioInsertSection = {
			id: "favorites",
			titleKey: "studio.module.insert.section.recommended",
			predicate: (name) => name === "Hero",
			// Lower order than `top` (20) so it claims Hero before
			// `top`'s `marketing` predicate gets a chance.
			order: 5,
		};
		act(() => {
			registry.getState().registerInsertSection(customSection);
		});

		render(
			<Providers registry={registry}>
				<InsertDrawerBody>{demoItems()}</InsertDrawerBody>
			</Providers>,
		);

		const favorites = screen.getByTestId("ak-insert-section-favorites");
		const top = screen.getByTestId("ak-insert-section-top");
		expect(favorites.querySelector('[data-testid="item-Hero"]')).toBeTruthy();
		// Hero claimed by favorites — must NOT also appear in top.
		expect(top.querySelector('[data-testid="item-Hero"]')).toBeNull();
		// BentoGrid still lands in top (marketing) since favorites
		// matched only Hero.
		expect(top.querySelector('[data-testid="item-BentoGrid"]')).toBeTruthy();
	});
});
