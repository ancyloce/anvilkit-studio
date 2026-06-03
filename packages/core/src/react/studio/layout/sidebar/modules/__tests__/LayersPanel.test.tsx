/**
 * @file Tests for `LayersPanel` quick-add popover.
 *
 * Verifies that built-in primitives are filtered against
 * `puckConfig.components` (only matching keys render) and that
 * plugin-contributed entries from `sidebar-registry-store.layerQuickAdds`
 * appear alongside them.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioPagesSourceProvider } from "@/context/pages-source";
import { LayersPanel } from "@/layout/sidebar/modules/layer/LayersPanel";
import {
	createSidebarRegistryStore,
	EditorI18nProvider,
	EditorUiStoreProvider,
	SidebarRegistryProvider,
	type SidebarRegistryStoreApi,
} from "@/state/index";
import type { StudioPagesSource } from "@/types/pages";

const mockPuckSnapshot = {
	config: {
		components: {} as Record<string, unknown>,
	},
	appState: {
		data: { content: [], zones: {} } as {
			content: unknown[];
			zones: Record<string, unknown[]>;
		},
		ui: { itemSelector: null as { index: number; zone: string } | null },
	},
	dispatch: vi.fn(),
	selectedItem: null as { props?: { id?: string } } | null,
	getSelectorForId: vi.fn(
		(): { index: number; zone: string } | undefined => undefined,
	),
	getItemById: vi.fn((): unknown => undefined),
};

vi.mock("@puckeditor/core", () => ({
	Puck: { Outline: () => <div data-testid="puck-outline-mock" /> },
	useGetPuck: () => () => mockPuckSnapshot,
	// `LayerTree` reads reactive state via `useReactivePuck` →
	// `createUsePuck()`. The real hook subscribes; the test double just
	// projects the current snapshot synchronously.
	createUsePuck:
		() =>
		<T,>(selector: (snapshot: typeof mockPuckSnapshot) => T): T =>
			selector(mockPuckSnapshot),
}));

afterEach(() => {
	cleanup();
	mockPuckSnapshot.config.components = {};
	mockPuckSnapshot.dispatch.mockReset();
});

function Setup({
	children,
	registry,
	source,
}: {
	readonly children: ReactNode;
	readonly registry?: SidebarRegistryStoreApi;
	readonly source?: StudioPagesSource;
}): ReactElement {
	const store = registry ?? createSidebarRegistryStore();
	return (
		<EditorI18nProvider>
			<EditorUiStoreProvider
				storeId={`layers-${Math.random().toString(36).slice(2)}`}
			>
				<SidebarRegistryProvider value={store}>
					<StudioPagesSourceProvider value={source}>
						{children}
					</StudioPagesSourceProvider>
				</SidebarRegistryProvider>
			</EditorUiStoreProvider>
		</EditorI18nProvider>
	);
}

describe("LayersPanel", () => {
	it("renders only built-in entries whose key exists in puckConfig.components", () => {
		mockPuckSnapshot.config.components = { Layout: {}, Text: {} };
		render(
			<Setup>
				<LayersPanel />
			</Setup>,
		);
		fireEvent.click(screen.getByTestId("ak-layer-layers-add"));
		expect(screen.getByTestId("ak-layer-quickadd-builtin:layout")).toBeTruthy();
		expect(screen.getByTestId("ak-layer-quickadd-builtin:text")).toBeTruthy();
		expect(screen.queryByTestId("ak-layer-quickadd-builtin:row")).toBeNull();
		expect(screen.queryByTestId("ak-layer-quickadd-builtin:column")).toBeNull();
	});

	it("includes plugin-contributed entries sorted by order", () => {
		mockPuckSnapshot.config.components = {};
		const registry = createSidebarRegistryStore();
		const insertA = vi.fn();
		const insertB = vi.fn();
		registry.getState().registerLayerQuickAdd({
			id: "alpha",
			labelKey: "studio.module.layer.layers.add.layout",
			order: 200,
			insert: insertA,
		});
		registry.getState().registerLayerQuickAdd({
			id: "beta",
			labelKey: "studio.module.layer.layers.add.row",
			order: 50,
			insert: insertB,
		});
		render(
			<Setup registry={registry}>
				<LayersPanel />
			</Setup>,
		);
		fireEvent.click(screen.getByTestId("ak-layer-layers-add"));
		const items = screen.getAllByTestId(/^ak-layer-quickadd-plugin:/);
		// `beta` (order=50) should render before `alpha` (order=200).
		expect(items[0]?.getAttribute("data-testid")).toBe(
			"ak-layer-quickadd-plugin:beta",
		);
		expect(items[1]?.getAttribute("data-testid")).toBe(
			"ak-layer-quickadd-plugin:alpha",
		);
	});

	it("dispatches a Puck insert action when a built-in entry is clicked", () => {
		mockPuckSnapshot.config.components = { Text: {} };
		render(
			<Setup>
				<LayersPanel />
			</Setup>,
		);
		fireEvent.click(screen.getByTestId("ak-layer-layers-add"));
		fireEvent.click(screen.getByTestId("ak-layer-quickadd-builtin:text"));
		expect(mockPuckSnapshot.dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "insert",
				componentType: "Text",
				// Puck's compound root-zone key — bare `default-zone` no-ops.
				destinationZone: "root:default-zone",
				destinationIndex: 0,
			}),
		);
	});

	it("invokes plugin-contributed insert callback with puckApi and currentSelection", () => {
		mockPuckSnapshot.config.components = {};
		const registry = createSidebarRegistryStore();
		const insert = vi.fn();
		registry.getState().registerLayerQuickAdd({
			id: "custom",
			labelKey: "studio.module.layer.layers.add.layout",
			insert,
		});
		render(
			<Setup registry={registry}>
				<LayersPanel />
			</Setup>,
		);
		fireEvent.click(screen.getByTestId("ak-layer-layers-add"));
		fireEvent.click(screen.getByTestId("ak-layer-quickadd-plugin:custom"));
		expect(insert).toHaveBeenCalledWith(
			expect.objectContaining({
				puckApi: expect.objectContaining({ dispatch: expect.any(Function) }),
				currentSelection: null,
			}),
		);
	});
});
