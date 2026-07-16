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

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
	mockPuckSnapshot.selectedItem = null;
});

function Setup({
	children,
	storeId = `tree-${Math.random().toString(36).slice(2)}`,
}: {
	readonly children: ReactNode;
	/** Stable id so `rerender()` reuses the same store across passes. */
	readonly storeId?: string;
}): ReactElement {
	return (
		<EditorI18nProvider>
			<EditorUiStoreProvider storeId={storeId}>
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

describe("LayerTree — selected row treatment (DESIGN.md §11)", () => {
	it("marks only the selected row data-selected, never more than one", () => {
		mockPuckSnapshot.appState.data = { content: makeRoots(3), zones: {} };
		mockPuckSnapshot.selectedItem = { props: { id: "n-1" } };
		render(
			<Setup>
				<LayerTree />
			</Setup>,
		);
		expect(
			screen.getByTestId("ak-layer-node-n-1").getAttribute("data-selected"),
		).toBe("true");
		expect(
			screen.getByTestId("ak-layer-node-n-0").getAttribute("data-selected"),
		).toBeNull();
		expect(
			screen.getByTestId("ak-layer-node-n-2").getAttribute("data-selected"),
		).toBeNull();
	});

	it("styles the selected row with a soft brand surface + brand outline, not a solid fill", () => {
		mockPuckSnapshot.appState.data = { content: makeRoots(1), zones: {} };
		mockPuckSnapshot.selectedItem = { props: { id: "n-0" } };
		render(
			<Setup>
				<LayerTree />
			</Setup>,
		);
		const row = screen.getByTestId("ak-layer-node-n-0");
		const inner = row.querySelector("div") as HTMLElement;
		expect(inner.className).toContain("bg-[var(--editor-selection-soft)]");
		expect(inner.className).toContain("ring-[var(--editor-selection)]");
		expect(inner.className).not.toMatch(/bg-\[var\(--editor-selection\)\]/);
	});
});

describe("LayerTree — canvas→sidebar selection sync (task Phase 6)", () => {
	it("expands a collapsed ancestor and scrolls the selected row into view when selection changes externally (e.g. a canvas click)", async () => {
		const scrollIntoViewMock = vi.fn();
		Element.prototype.scrollIntoView = scrollIntoViewMock;

		mockPuckSnapshot.appState.data = {
			content: [{ type: "Layout", props: { id: "layout-1" } }],
			zones: {
				"layout-1:default": [{ type: "Text", props: { id: "text-2" } }],
			},
		};
		mockPuckSnapshot.config.components = { Layout: {}, Text: {} };

		const storeId = `sync-${Math.random().toString(36).slice(2)}`;
		const { rerender } = render(
			<Setup storeId={storeId}>
				<LayerTree />
			</Setup>,
		);

		// Collapse layout-1 so its child is hidden.
		fireEvent.click(screen.getByTestId("ak-layer-toggle-layout-1"));
		expect(screen.queryByTestId("ak-layer-node-text-2")).toBeNull();

		// Simulate a canvas click selecting the nested, currently-hidden child.
		mockPuckSnapshot.selectedItem = { props: { id: "text-2" } };
		rerender(
			<Setup storeId={storeId}>
				<LayerTree />
			</Setup>,
		);

		await vi.waitFor(() => {
			expect(screen.getByTestId("ak-layer-node-text-2")).not.toBeNull();
		});
		expect(
			screen.getByTestId("ak-layer-node-text-2").getAttribute("data-selected"),
		).toBe("true");
		await vi.waitFor(() => {
			expect(scrollIntoViewMock).toHaveBeenCalled();
		});
	});
});
