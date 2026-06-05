/**
 * @file Tests for the dual-path Layer-tree renderer.
 *
 * The recursive nested renderer is exercised by `LayersPanel` /
 * `use-layer-tree` tests; this file locks in the windowing threshold:
 * below 50 visible rows the nested tree renders every node, at/above it
 * the flat windowed path bounds the DOM node count. The flat path's
 * drag-data contract (per-row `{kind,zone,index}` + empty-zone
 * placeholders) is verified deterministically by `flattenVisibleRows`
 * + `resolveDrop` unit tests in `use-layer-tree.test.ts`.
 */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayerTree } from "@/layout/sidebar/modules/layer/components/LayerTree";
import { EditorI18nProvider, EditorUiStoreProvider } from "@/state/index";

interface MockNode {
	type: string;
	props: { id: string };
}

const mockPuckSnapshot = {
	config: { components: {} as Record<string, unknown> },
	appState: {
		data: {
			content: [] as MockNode[],
			zones: {} as Record<string, MockNode[]>,
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
	useGetPuck: () => () => mockPuckSnapshot,
	createUsePuck:
		() =>
		<T,>(selector: (s: typeof mockPuckSnapshot) => T): T =>
			selector(mockPuckSnapshot),
}));

afterEach(() => {
	cleanup();
	mockPuckSnapshot.appState.data = { content: [], zones: {} };
	mockPuckSnapshot.config.components = {};
});

function Setup({ children }: { readonly children: ReactNode }): ReactElement {
	return (
		<EditorI18nProvider>
			<EditorUiStoreProvider
				storeId={`tree-${Math.random().toString(36).slice(2)}`}
			>
				{children}
			</EditorUiStoreProvider>
		</EditorI18nProvider>
	);
}

function makeRoots(n: number): MockNode[] {
	return Array.from({ length: n }, (_, i) => ({
		type: "Text",
		props: { id: `n-${i}` },
	}));
}

describe("LayerTree — dual-path threshold", () => {
	it("renders every node inline below the threshold (nested path)", () => {
		mockPuckSnapshot.appState.data = { content: makeRoots(10), zones: {} };
		render(
			<Setup>
				<LayerTree />
			</Setup>,
		);
		expect(screen.queryByTestId("ak-layer-tree-virtualized")).toBeNull();
		expect(
			document.querySelectorAll("[data-testid^='ak-layer-node-']").length,
		).toBe(10);
	});

	it("windows a large tree to a bounded DOM slice at/above the threshold", () => {
		const total = 60;
		mockPuckSnapshot.appState.data = { content: makeRoots(total), zones: {} };
		render(
			<Setup>
				<LayerTree />
			</Setup>,
		);
		const viewport = screen.getByTestId("ak-layer-tree-virtualized");
		expect(viewport.getAttribute("data-virtualized")).toBe("true");
		expect(
			document.querySelectorAll("[data-testid^='ak-layer-node-']").length,
		).toBeLessThan(total);
	});
});
