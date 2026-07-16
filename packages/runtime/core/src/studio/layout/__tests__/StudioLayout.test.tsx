/**
 * @file `StudioLayout` panel shell (task Phase 5): resizable/collapsible
 * left panel + inspector, wired through `react-resizable-panels`, plus
 * Focus Mode.
 *
 * These tests deliberately avoid simulating real pointer-drag resize —
 * `react-resizable-panels`' own suite already covers drag mechanics, and
 * jsdom has no real layout engine to make that reliable. Instead they
 * pin the parts this integration owns: which panels are wrapped by the
 * library (`[data-panel]` presence + the configured `id`s — a fixed set
 * of 3, regardless of collapse/Focus Mode state, see below), that both
 * the left panel and the inspector never unmount from the `Group` (the
 * pre-existing "always mounted, no canvas reflow" invariant — only their
 * *content* conditionally unmounts), and that Focus Mode hides the left
 * panel without touching its underlying `drawerCollapsed` preference.
 *
 * Regression: the left panel used to be conditionally included/excluded
 * from the `Group`'s children (the `Panel` itself, not just its content).
 * Toggling that panel *count* on a live `Group` races
 * `react-resizable-panels`' internal layout cache and throws `Invalid N
 * panel layout: ...` the next time the group's `ResizeObserver` fires —
 * reproduced against the real dev server, not just here in jsdom. The
 * fix keeps all 3 `Panel`s permanently mounted and drives visibility via
 * the library's own `collapsible` + `collapsedSize={0}` + imperative
 * `panelRef`, mirroring the inspector's pre-existing pattern.
 */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioLayout } from "@/layout/StudioLayout";
import {
	createSidebarRegistryStore,
	EditorI18nProvider,
	SidebarRegistryProvider,
} from "@/state/index";
import { EditorUiStoreContext } from "@/state/slices/EditorUiStoreProvider";
import {
	createEditorUiStore,
	type EditorUiStoreApi,
} from "@/state/slices/editor-ui-store";

vi.mock("@puckeditor/core", () => ({
	Puck: {
		Components: () => <div data-testid="puck-components-mock" />,
		Preview: () => <div data-testid="puck-preview-mock" />,
		Fields: () => <div data-testid="puck-fields-mock" />,
	},
	useGetPuck: () => () => ({
		history: { back: vi.fn(), forward: vi.fn() },
		appState: { data: null },
		dispatch: vi.fn(),
	}),
}));

// `<PublishPanel>` unconditionally reads `useStudioRuntime()` (a strict
// context only the full `<Studio>` mount sets up) — out of scope for
// these panel-shell tests, which only care about resize/collapse/Focus
// Mode wiring, so it's stubbed rather than fed a hand-built runtime.
vi.mock("@/layout/PublishPanel", () => ({
	PublishPanel: () => <div data-testid="publish-panel-mock" />,
}));

afterEach(cleanup);

function Setup({
	children,
	store,
}: {
	readonly children: ReactNode;
	readonly store: EditorUiStoreApi;
}): ReactElement {
	const registry = createSidebarRegistryStore();
	return (
		<EditorI18nProvider>
			<EditorUiStoreContext value={store}>
				<SidebarRegistryProvider value={registry}>
					{children}
				</SidebarRegistryProvider>
			</EditorUiStoreContext>
		</EditorI18nProvider>
	);
}

function renderLayout(store: EditorUiStoreApi) {
	return render(
		<Setup store={store}>
			<StudioLayout />
		</Setup>,
	);
}

describe("StudioLayout panel shell", () => {
	it("wraps the left panel, canvas, and inspector in real react-resizable-panels Panels", () => {
		const store = createEditorUiStore({ storeId: `layout-${Math.random()}` });
		const { container } = renderLayout(store);

		expect(
			container.querySelector('[data-panel][id="ak-left-panel"]'),
		).not.toBeNull();
		expect(
			container.querySelector('[data-panel][id="ak-canvas-panel"]'),
		).not.toBeNull();
		expect(
			container.querySelector('[data-panel][id="ak-inspector-panel"]'),
		).not.toBeNull();
		// Resize handles between panels.
		expect(container.querySelectorAll("[data-separator]").length).toBe(2);
	});

	it("keeps exactly 3 registered Panels regardless of drawerCollapsed/Focus Mode (regression: conditional Panel mounting threw 'Invalid N panel layout')", () => {
		const store = createEditorUiStore({ storeId: `layout-${Math.random()}` });
		const { container, rerender } = renderLayout(store);
		const panelCount = () => container.querySelectorAll("[data-panel]").length;

		expect(panelCount()).toBe(3);

		store.getState().setDrawerCollapsed(true);
		rerender(
			<Setup store={store}>
				<StudioLayout />
			</Setup>,
		);
		expect(panelCount()).toBe(3);

		store.getState().setDrawerCollapsed(false);
		store.getState().setFocusMode(true);
		rerender(
			<Setup store={store}>
				<StudioLayout />
			</Setup>,
		);
		expect(panelCount()).toBe(3);
	});

	it("unmounts the left panel's content (not the Panel wrapper) when drawerCollapsed is true", () => {
		const store = createEditorUiStore({ storeId: `layout-${Math.random()}` });
		store.getState().setDrawerCollapsed(true);
		const { container } = renderLayout(store);

		// The Panel wrapper stays registered with the Group (see the
		// dedicated regression test above) — only its content unmounts.
		expect(
			container.querySelector('[data-panel][id="ak-left-panel"]'),
		).not.toBeNull();
		expect(screen.queryByTestId("puck-components-mock")).toBeNull();
		// Canvas + inspector still render.
		expect(screen.getByTestId("puck-preview-mock")).not.toBeNull();
		expect(screen.getByTestId("puck-fields-mock")).not.toBeNull();
	});

	it("keeps the inspector always mounted even when inspectorCollapsed is true", () => {
		const store = createEditorUiStore({ storeId: `layout-${Math.random()}` });
		store.getState().setInspectorCollapsed(true);
		renderLayout(store);

		expect(screen.getByTestId("puck-fields-mock")).not.toBeNull();
	});

	it("Focus Mode hides the left panel's content and collapses the inspector without mutating drawerCollapsed/inspectorCollapsed", () => {
		const store = createEditorUiStore({ storeId: `layout-${Math.random()}` });
		store.getState().setFocusMode(true);
		const { container } = renderLayout(store);

		// The Panel wrapper stays registered with the Group — only its
		// content unmounts (see the dedicated panel-count regression test).
		expect(
			container.querySelector('[data-panel][id="ak-left-panel"]'),
		).not.toBeNull();
		expect(screen.queryByTestId("puck-components-mock")).toBeNull();
		// The inspector stays mounted (Focus Mode collapses it visually via
		// the panel API, it does not unmount it).
		expect(screen.getByTestId("puck-fields-mock")).not.toBeNull();
		// The underlying preferences are untouched — turning Focus Mode
		// off should restore whatever was there before.
		expect(store.getState().drawerCollapsed).toBe(false);
		expect(store.getState().inspectorCollapsed).toBe(false);

		store.getState().setFocusMode(false);
	});

	it("restores the left panel's content when Focus Mode turns off", () => {
		const store = createEditorUiStore({ storeId: `layout-${Math.random()}` });
		const { rerender } = renderLayout(store);
		expect(screen.queryByTestId("puck-components-mock")).not.toBeNull();

		store.getState().setFocusMode(true);
		rerender(
			<Setup store={store}>
				<StudioLayout />
			</Setup>,
		);
		expect(screen.queryByTestId("puck-components-mock")).toBeNull();

		store.getState().setFocusMode(false);
		rerender(
			<Setup store={store}>
				<StudioLayout />
			</Setup>,
		);
		expect(screen.queryByTestId("puck-components-mock")).not.toBeNull();
	});
});
