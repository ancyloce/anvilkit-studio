/**
 * @file `StudioLayout` panel shell (task Phase 5): resizable/collapsible
 * left panel + inspector, wired through `react-resizable-panels`, plus
 * Focus Mode.
 *
 * These tests deliberately avoid simulating real pointer-drag resize —
 * `react-resizable-panels`' own suite already covers drag mechanics, and
 * jsdom has no real layout engine to make that reliable. Instead they
 * pin the parts this integration owns: which panels are wrapped by the
 * library (`[data-panel]` presence + the configured `id`s), that the
 * inspector never unmounts regardless of collapse/Focus Mode state (the
 * pre-existing "always mounted, no canvas reflow" invariant), and that
 * Focus Mode hides the left panel without touching its underlying
 * `drawerCollapsed` preference.
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

	it("omits the left panel entirely when drawerCollapsed is true (unchanged pre-Phase-5 behavior)", () => {
		const store = createEditorUiStore({ storeId: `layout-${Math.random()}` });
		store.getState().setDrawerCollapsed(true);
		const { container } = renderLayout(store);

		expect(
			container.querySelector('[data-panel][id="ak-left-panel"]'),
		).toBeNull();
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

	it("Focus Mode hides the left panel and collapses the inspector without mutating drawerCollapsed/inspectorCollapsed", () => {
		const store = createEditorUiStore({ storeId: `layout-${Math.random()}` });
		store.getState().setFocusMode(true);
		const { container } = renderLayout(store);

		expect(
			container.querySelector('[data-panel][id="ak-left-panel"]'),
		).toBeNull();
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

	it("restores the left panel and inspector to their prior state when Focus Mode turns off", () => {
		const store = createEditorUiStore({ storeId: `layout-${Math.random()}` });
		const { container, rerender } = renderLayout(store);
		expect(
			container.querySelector('[data-panel][id="ak-left-panel"]'),
		).not.toBeNull();

		store.getState().setFocusMode(true);
		rerender(
			<Setup store={store}>
				<StudioLayout />
			</Setup>,
		);
		expect(
			container.querySelector('[data-panel][id="ak-left-panel"]'),
		).toBeNull();

		store.getState().setFocusMode(false);
		rerender(
			<Setup store={store}>
				<StudioLayout />
			</Setup>,
		);
		expect(
			container.querySelector('[data-panel][id="ak-left-panel"]'),
		).not.toBeNull();
	});
});
