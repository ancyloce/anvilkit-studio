/**
 * @file Tests for `FieldsPanel` (Puck `fields` override) — DESIGN.md §7.8:
 * the inspector must show the selection's real display name (never a
 * generic "Root" label for a real component) and must not disappear
 * entirely when nothing is selected.
 *
 * Mirrors `reactive-selectors.test.tsx`'s `@puckeditor/core` mock so
 * `useBreadcrumbs()` (consumed internally by `FieldsPanel`) resolves from
 * the same fake Puck state driving the `itemSelector` prop.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockPuckState {
	appState: {
		ui: { itemSelector: { index: number; zone?: string } | null };
		data: { content: { type: string; props: { id: string } }[] };
	};
}

let puckState: MockPuckState;
const listeners = new Set<() => void>();

function freshState(): MockPuckState {
	return {
		appState: { ui: { itemSelector: null }, data: { content: [] } },
	};
}

vi.mock("@puckeditor/core", () => ({
	createUsePuck:
		() =>
		<T,>(selector: (s: MockPuckState) => T): T =>
			useSyncExternalStore(
				(cb) => {
					listeners.add(cb);
					return () => listeners.delete(cb);
				},
				() => selector(puckState),
				() => selector(puckState),
			),
}));

import { FieldsPanel } from "@/overrides/layout/FieldsPanel";
import { EditorI18nProvider } from "@/state/index";

beforeEach(() => {
	puckState = freshState();
});

afterEach(() => {
	cleanup();
	listeners.clear();
});

describe("FieldsPanel", () => {
	it("renders a quiet empty state instead of a blank pane when nothing is selected", () => {
		render(
			<EditorI18nProvider>
				<FieldsPanel isLoading={false} itemSelector={null}>
					<div data-testid="puck-field" />
				</FieldsPanel>
			</EditorI18nProvider>,
		);
		expect(screen.getByTestId("ak-fields-panel-empty")).toBeTruthy();
		expect(
			screen.getByText("Select a component to edit its properties."),
		).toBeTruthy();
		expect(screen.queryByTestId("puck-field")).toBeNull();
	});

	it("shows the selected component's real name as the sticky header title, not a generic Root label", () => {
		puckState = {
			appState: {
				ui: { itemSelector: { index: 0, zone: "default-zone" } },
				data: { content: [{ type: "Hero", props: { id: "h-1" } }] },
			},
		};
		render(
			<EditorI18nProvider>
				<FieldsPanel
					isLoading={false}
					itemSelector={{ index: 0, zone: "default-zone" }}
				>
					<div data-testid="puck-field" />
				</FieldsPanel>
			</EditorI18nProvider>,
		);
		const title = screen.getByTestId("ak-fields-panel-title");
		expect(title.textContent).toBe("Hero");
		expect(title.textContent).not.toBe("Root");
		expect(screen.getByTestId("puck-field")).toBeTruthy();
	});

	it("labels the root-only selection Root — that is the correct label when no component is selected", () => {
		puckState = {
			appState: {
				ui: { itemSelector: { index: 0, zone: "default-zone" } },
				data: { content: [] },
			},
		};
		render(
			<EditorI18nProvider>
				<FieldsPanel
					isLoading={false}
					itemSelector={{ index: 0, zone: "default-zone" }}
				>
					<div data-testid="puck-field" />
				</FieldsPanel>
			</EditorI18nProvider>,
		);
		expect(screen.getByTestId("ak-fields-panel-title").textContent).toBe(
			"Root",
		);
		// Root selections are still a real selection: the field tree
		// renders, it is simply the root's.
		expect(screen.getByTestId("puck-field")).toBeTruthy();
	});
});

describe("FieldsPanel — visual editor off (ED-INSPECT-002)", () => {
	function renderLegacy(isLoading = false): void {
		puckState = {
			appState: {
				ui: { itemSelector: { index: 0, zone: "default-zone" } },
				data: { content: [{ type: "Hero", props: { id: "h-1" } }] },
			},
		};
		render(
			<EditorI18nProvider>
				<FieldsPanel
					isLoading={isLoading}
					itemSelector={{ index: 0, zone: "default-zone" }}
				>
					<div data-testid="puck-field" />
				</FieldsPanel>
			</EditorI18nProvider>,
		);
	}

	it("renders the native field tree with no tab bar and no editor sections", () => {
		renderLegacy();
		expect(screen.getByTestId("puck-field")).toBeTruthy();
		// None of the tabbed inspector's surfaces exist without the editor.
		expect(screen.queryByTestId("ak-inspector-tabs")).toBeNull();
		expect(screen.queryByTestId("ak-editor-inspector")).toBeNull();
		expect(document.querySelectorAll("[role='tablist']")).toHaveLength(0);
		expect(screen.queryByTestId("ak-layout-section")).toBeNull();
	});

	it("keeps the fields inside the panel's own single scroll body", () => {
		renderLegacy();
		const body = screen
			.getByTestId("puck-field")
			.closest(".overflow-auto") as HTMLElement | null;
		expect(body).not.toBeNull();
		expect(body?.className).toContain("flex-1");
	});

	it("keeps the loading treatment on the native field tree", () => {
		renderLegacy(true);
		expect(screen.getByTestId("ak-fields-panel-native").className).toContain(
			"opacity-70",
		);
	});
});
