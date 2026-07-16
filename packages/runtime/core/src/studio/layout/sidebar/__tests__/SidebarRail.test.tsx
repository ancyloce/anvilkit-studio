/**
 * @file Tests for the `<SidebarRail>` component (PRD §4.1, §4.3).
 *
 * Covers click-active-to-collapse semantics, roving focus, ARIA, and
 * the imperative `focusActive()` handle.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStore } from "zustand";
import {
	SidebarRail,
	type SidebarRailHandle,
} from "@/layout/sidebar/SidebarRail";
import { SidebarRegistryProvider } from "@/state/sidebar-registry/SidebarRegistryProvider";
import { createSidebarRegistryStore } from "@/state/sidebar-registry/sidebar-registry-store";
import {
	EditorUiStoreProvider,
	useEditorUiStoreApi,
} from "@/state/slices/EditorUiStoreProvider";

afterEach(cleanup);

beforeEach(() => {
	window.localStorage.clear();
});

function StateProbe({
	probeRef,
}: {
	probeRef: { current: { collapsed: boolean; tab: string } | null };
}) {
	const store = useEditorUiStoreApi();
	const collapsed = useStore(store, (s) => s.drawerCollapsed);
	const tab = useStore(store, (s) => s.activeTab);
	probeRef.current = { collapsed, tab };
	return null;
}

function renderRail(storeId: string, ref?: React.Ref<SidebarRailHandle>) {
	const probeRef: { current: { collapsed: boolean; tab: string } | null } = {
		current: null,
	};
	// Seed every optional module surface so the rail renders all six
	// tabs — the assertions below depend on the full PRD ordering.
	const registry = createSidebarRegistryStore();
	registry.getState().registerAssetSource({
		list: () => [],
		upload: async () => [],
	});
	registry.getState().registerCopySnippetPack({ id: "test", snippets: [] });
	registry.getState().registerCopilotPanel({ render: () => null });
	registry.getState().registerHistoryPanel({ render: () => null });
	const utils = render(
		<EditorUiStoreProvider storeId={storeId}>
			<SidebarRegistryProvider value={registry}>
				<SidebarRail ref={ref} />
				<StateProbe probeRef={probeRef} />
			</SidebarRegistryProvider>
		</EditorUiStoreProvider>,
	);
	return { ...utils, probeRef };
}

describe("SidebarRail", () => {
	it("renders six rail tabs in PRD order", () => {
		renderRail("rail-order");
		const tabs = screen.getAllByRole("tab");
		expect(tabs).toHaveLength(6);
		expect(tabs[0]?.id).toBe("ak-rail-tab-insert");
		expect(tabs[1]?.id).toBe("ak-rail-tab-layer");
		expect(tabs[2]?.id).toBe("ak-rail-tab-image");
		expect(tabs[3]?.id).toBe("ak-rail-tab-text");
		expect(tabs[4]?.id).toBe("ak-rail-tab-copilot");
		expect(tabs[5]?.id).toBe("ak-rail-tab-history");
	});

	it("renders the design-system tab once a panel is registered (AR-a)", () => {
		// The seam is gated on a registered panel: with none, no tab; with
		// one, the `design-system` rail tab appears (insert + layer +
		// design-system = 3 visible).
		const registry = createSidebarRegistryStore();
		registry.getState().registerDesignSystemPanel({ render: () => null });
		render(
			<EditorUiStoreProvider storeId="rail-design-system">
				<SidebarRegistryProvider value={registry}>
					<SidebarRail />
				</SidebarRegistryProvider>
			</EditorUiStoreProvider>,
		);
		const tabs = screen.getAllByRole("tab");
		expect(tabs.map((t) => t.id)).toContain("ak-rail-tab-design-system");
	});

	it("uses role=tablist with vertical orientation", () => {
		renderRail("rail-tablist");
		const tablist = screen.getByRole("tablist");
		expect(tablist.getAttribute("aria-orientation")).toBe("vertical");
	});

	it("aria-controls points at the panel id and aria-selected reflects active+expanded", () => {
		renderRail("rail-aria");
		const insert = screen.getByRole("tab", { name: "Insert" });
		const layer = screen.getByRole("tab", { name: "Pages & Layers" });
		expect(insert.getAttribute("aria-controls")).toBe("ak-sidebar-panel");
		expect(insert.getAttribute("aria-selected")).toBe("true");
		expect(layer.getAttribute("aria-selected")).toBe("false");
		// Roving focus: only the active tab is in the tab order.
		expect(insert.tabIndex).toBe(0);
		expect(layer.tabIndex).toBe(-1);
	});

	it("clicking an inactive tab switches activeTab", () => {
		const { probeRef } = renderRail("rail-switch");
		fireEvent.click(screen.getByRole("tab", { name: "Pages & Layers" }));
		expect(probeRef.current?.tab).toBe("layer");
		expect(probeRef.current?.collapsed).toBe(false);
	});

	it("clicking the already-active tab collapses the panel without changing activeTab", () => {
		const { probeRef } = renderRail("rail-collapse");
		fireEvent.click(screen.getByRole("tab", { name: "Insert" }));
		expect(probeRef.current?.collapsed).toBe(true);
		expect(probeRef.current?.tab).toBe("insert");
	});

	it("clicking any tab while collapsed expands and switches to that module", () => {
		const { probeRef } = renderRail("rail-expand");
		// Collapse first.
		fireEvent.click(screen.getByRole("tab", { name: "Insert" }));
		expect(probeRef.current?.collapsed).toBe(true);
		fireEvent.click(screen.getByRole("tab", { name: "Assets" }));
		expect(probeRef.current?.collapsed).toBe(false);
		expect(probeRef.current?.tab).toBe("image");
	});

	it("ArrowDown / ArrowUp move roving focus and wrap", () => {
		renderRail("rail-arrow");
		const tabs = screen.getAllByRole("tab");
		const lastIndex = tabs.length - 1;
		tabs[0]?.focus();
		expect(document.activeElement).toBe(tabs[0]);
		// base-ui binds the roving-focus keydown listener to the focused tab,
		// not the tablist, so dispatching on the active element is what
		// actually exercises the production path.
		fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
		expect(document.activeElement).toBe(tabs[1]);
		fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });
		expect(document.activeElement).toBe(tabs[0]);
		// Wrap from first → last on ArrowUp.
		fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });
		expect(document.activeElement).toBe(tabs[lastIndex]);
		// Wrap from last → first on ArrowDown.
		fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
		expect(document.activeElement).toBe(tabs[0]);
	});

	it("Home / End jump to first / last tab", () => {
		renderRail("rail-home-end");
		const tabs = screen.getAllByRole("tab");
		const lastIndex = tabs.length - 1;
		tabs[2]?.focus();
		fireEvent.keyDown(document.activeElement as Element, { key: "End" });
		expect(document.activeElement).toBe(tabs[lastIndex]);
		fireEvent.keyDown(document.activeElement as Element, { key: "Home" });
		expect(document.activeElement).toBe(tabs[0]);
	});

	it("focusActive() returns focus to the active rail tab", () => {
		const handleRef = createRef<SidebarRailHandle>();
		renderRail("rail-imperative", handleRef);
		const tabs = screen.getAllByRole("tab");
		// Drag focus elsewhere.
		tabs[2]?.focus();
		expect(document.activeElement).toBe(tabs[2]);
		handleRef.current?.focusActive();
		expect(document.activeElement).toBe(tabs[0]);
	});

	it("marks only the active tab aria-selected, with the neutral raised surface + Electric Iris className wired (DESIGN.md §7.2)", () => {
		renderRail("rail-active-styling");
		const insert = screen.getByRole("tab", { name: "Insert" });
		const layer = screen.getByRole("tab", { name: "Pages & Layers" });
		expect(insert.getAttribute("aria-selected")).toBe("true");
		expect(layer.getAttribute("aria-selected")).toBe("false");
		// Not a fully-filled blue button: the active-state utilities target a
		// neutral raised surface + brand-colored icon/indicator, never a flat
		// brand background fill.
		expect(insert.className).toContain(
			"aria-selected:bg-[var(--editor-panel-raised)]",
		);
		expect(insert.className).toContain("aria-selected:text-[var(--brand)]");
		expect(insert.className).not.toMatch(/aria-selected:bg-\[var\(--brand\)/);
	});

	describe("core/extension grouping divider (task Phase 12)", () => {
		it("omits the divider when no extension modules are visible", () => {
			render(
				<EditorUiStoreProvider storeId="rail-divider-none">
					<SidebarRegistryProvider value={createSidebarRegistryStore()}>
						<SidebarRail />
					</SidebarRegistryProvider>
				</EditorUiStoreProvider>,
			);
			expect(screen.getAllByRole("tab")).toHaveLength(2);
			expect(screen.queryByTestId("ak-rail-group-divider")).toBeNull();
		});

		it("renders exactly one divider between the core and extension groups", () => {
			renderRail("rail-divider-present");
			const divider = screen.getByTestId("ak-rail-group-divider");
			const tabs = screen.getAllByRole("tab");
			// Divider sits after layer (last core tab) and before image
			// (first extension tab) — DOM order, not just presence.
			const layerIndex = tabs.findIndex((t) => t.id === "ak-rail-tab-layer");
			const imageIndex = tabs.findIndex((t) => t.id === "ak-rail-tab-image");
			const dividerPosition =
				tabs[layerIndex]?.compareDocumentPosition(divider);
			expect(
				(dividerPosition ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();
			const imagePosition = divider.compareDocumentPosition(
				tabs[imageIndex] as Node,
			);
			expect(imagePosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		});

		it("does not affect roving keyboard focus (divider is not a tab)", () => {
			renderRail("rail-divider-keynav");
			const tabs = screen.getAllByRole("tab");
			tabs[1]?.focus();
			fireEvent.keyDown(document.activeElement as Element, {
				key: "ArrowDown",
			});
			// Moves straight from layer (index 1) to image (index 2) — the
			// divider between them is skipped, not focused.
			expect(document.activeElement).toBe(tabs[2]);
		});
	});
});
