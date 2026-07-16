/**
 * @file Tests for {@link DrawerItem} (task Phase 9).
 *
 * Covers the grid-mode presentation fallback chain (thumbnail →
 * custom preview → icon → generic placeholder) and the list-mode
 * icon + title + optional-description row, driven by a mocked
 * `createUsePuck` snapshot so each case can supply a different
 * `metadata` shape without touching a real Puck instance.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { useEffect, useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorUiStoreProvider, useEditorUiStore } from "@/state/index";

let componentsStub: Record<
	string,
	{ label?: string; metadata?: Record<string, unknown> }
> = {};

// Backed by the REAL `useSyncExternalStore` (not a plain
// `selector(snapshot)` call) so this mock reproduces the real
// `createUsePuck` re-render-on-identity-change contract: a selector
// whose return value is never `Object.is`-stable across calls makes
// React re-render on every commit — the exact "Maximum update depth
// exceeded" regression this file guards (see the loop-guard test
// below).
vi.mock("@puckeditor/core", () => ({
	createUsePuck:
		() =>
		<T,>(
			selector: (snapshot: {
				config: { components: typeof componentsStub };
			}) => T,
		): T =>
			useSyncExternalStore(
				() => () => undefined,
				() => selector({ config: { components: componentsStub } }),
				() => selector({ config: { components: componentsStub } }),
			),
}));

afterEach(() => {
	cleanup();
	componentsStub = {};
});

import { DrawerItem } from "@/overrides/layout/DrawerItem";

function renderItem(name: string, storeId: string): ReturnType<typeof render> {
	return render(
		<EditorUiStoreProvider storeId={storeId}>
			<DrawerItem name={name}>
				<span>drag</span>
			</DrawerItem>
		</EditorUiStoreProvider>,
	);
}

describe("DrawerItem — grid mode (default view)", () => {
	it("renders a thumbnail image when metadata provides one", () => {
		componentsStub = {
			Hero: {
				label: "Hero",
				metadata: { thumbnail: "https://example.com/hero.png" },
			},
		};
		renderItem("Hero", "drawer-item-thumbnail");
		const img = screen.getByAltText("Hero preview");
		expect(img).toHaveAttribute("src", "https://example.com/hero.png");
	});

	it("renders a custom preview node when there is no thumbnail", () => {
		componentsStub = {
			Hero: {
				label: "Hero",
				metadata: { preview: <div data-testid="custom-preview">P</div> },
			},
		};
		renderItem("Hero", "drawer-item-preview");
		expect(screen.getByTestId("custom-preview")).toBeInTheDocument();
	});

	it("renders the component icon when there is no thumbnail or preview", () => {
		componentsStub = {
			Hero: {
				label: "Hero",
				metadata: { icon: <svg data-testid="custom-icon" /> },
			},
		};
		renderItem("Hero", "drawer-item-icon");
		expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
	});

	it("falls back to the generic placeholder when nothing is supplied", () => {
		componentsStub = { Hero: { label: "Hero" } };
		const { container } = renderItem("Hero", "drawer-item-placeholder");
		expect(
			container.querySelector("svg[viewBox='0 0 160 120']"),
		).not.toBeNull();
	});

	it("renders the component title", () => {
		componentsStub = { Hero: { label: "Hero Banner" } };
		renderItem("Hero", "drawer-item-title");
		expect(screen.getByText("Hero Banner")).toBeInTheDocument();
	});

	// Regression: the `useReactivePuck` selector must project a stable
	// `config.components[name]` reference and derive the presentation via
	// `useMemo`, not build a fresh presentation object literal inline.
	// `useReactivePuck` re-renders whenever the selector's return value is
	// not `Object.is`-equal to the previous one, so an inline object
	// literal never stabilizes and forces React into an infinite
	// re-render loop ("Maximum update depth exceeded").
	it("does not loop infinitely when the presentation is derived on every read", () => {
		componentsStub = {
			Hero: {
				label: "Hero",
				metadata: { description: "A large marketing banner." },
			},
		};
		expect(() => renderItem("Hero", "drawer-item-loop-guard")).not.toThrow();
	});
});

function PrimeListView(): null {
	const setMode = useEditorUiStore((s) => s.setComponentViewMode);
	useEffect(() => {
		setMode("list");
	}, [setMode]);
	return null;
}

describe("DrawerItem — list mode", () => {
	function renderInListMode(
		name: string,
		storeId: string,
	): ReturnType<typeof render> {
		return render(
			<EditorUiStoreProvider storeId={storeId}>
				<PrimeListView />
				<DrawerItem name={name}>
					<span>drag</span>
				</DrawerItem>
			</EditorUiStoreProvider>,
		);
	}

	it("renders icon, title, and description when metadata provides a description", () => {
		componentsStub = {
			Hero: {
				label: "Hero",
				metadata: { description: "A large marketing banner." },
			},
		};
		renderInListMode("Hero", "drawer-item-list-desc");
		expect(screen.getByText("Hero")).toBeInTheDocument();
		expect(screen.getByText("A large marketing banner.")).toBeInTheDocument();
	});

	it("omits the description paragraph when metadata has none", () => {
		componentsStub = { Hero: { label: "Hero" } };
		renderInListMode("Hero", "drawer-item-list-no-desc");
		expect(screen.getByText("Hero")).toBeInTheDocument();
		expect(screen.queryByText(/./, { selector: "p" })).toBeNull();
	});
});
