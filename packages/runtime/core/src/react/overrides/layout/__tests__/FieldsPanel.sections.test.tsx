/**
 * @file Tests for `FieldsPanel`'s section grouping, header icon,
 * component-actions menu, and the full-ancestor breadcrumb chain.
 *
 * Mirrors `FieldsPanel.test.tsx`'s `@puckeditor/core` mock, extended
 * with `config` (field defs + presentation metadata + labels) and a
 * spyable `dispatch`. Children mimic Puck's real `fields`-override
 * shape: one element per field carrying a `fieldName` prop.
 */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { type ReactNode, useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockItem {
	type: string;
	props: Record<string, unknown> & { id: string };
}

interface MockPuckState {
	appState: {
		ui: { itemSelector: { index: number; zone?: string } | null };
		data: {
			content: MockItem[];
			zones?: Record<string, MockItem[]>;
		};
	};
	config?: Record<string, unknown>;
	selectedItem?: MockItem | null;
	dispatch?: (action: unknown) => void;
}

let puckState: MockPuckState;
const listeners = new Set<() => void>();

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
import { EditorI18nProvider, EditorUiStoreProvider } from "@/state/index";

beforeEach(() => {
	puckState = {
		appState: { ui: { itemSelector: null }, data: { content: [] } },
	};
});

afterEach(() => {
	cleanup();
	listeners.clear();
});

function FieldStub({ fieldName }: { fieldName: string }): ReactNode {
	return <div data-testid={`field-${fieldName}`} />;
}

function renderPanel(
	children: ReactNode,
	storeId = "fields-sections-test",
): ReturnType<typeof render> {
	return render(
		<EditorI18nProvider>
			<EditorUiStoreProvider storeId={storeId}>
				<FieldsPanel
					isLoading={false}
					itemSelector={{ index: 0, zone: "root:default-zone" }}
				>
					{children}
				</FieldsPanel>
			</EditorUiStoreProvider>
		</EditorI18nProvider>,
	);
}

function selectHero(config: Record<string, unknown>): void {
	const hero: MockItem = { type: "Hero", props: { id: "h-1" } };
	puckState = {
		appState: {
			ui: { itemSelector: { index: 0, zone: "root:default-zone" } },
			data: { content: [hero] },
		},
		config,
		selectedItem: hero,
		dispatch: vi.fn(),
	};
}

describe("FieldsPanel — section grouping", () => {
	it("renders children verbatim when no field declares a section", () => {
		selectHero({
			components: {
				Hero: {
					fields: { title: { type: "text" }, size: { type: "number" } },
				},
			},
		});
		renderPanel(
			[<FieldStub key="title" fieldName="title" />, <FieldStub key="size" fieldName="size" />],
		);
		expect(screen.getByTestId("field-title")).toBeInTheDocument();
		expect(screen.getByTestId("field-size")).toBeInTheDocument();
		expect(
			document.querySelector("[data-testid^='ak-inspector-section-']"),
		).toBeNull();
	});

	it("groups sectioned fields into collapsible sections, ungrouped fields first", async () => {
		selectHero({
			components: {
				Hero: {
					fields: {
						title: { type: "text" }, // no section → ungrouped
						width: {
							type: "number",
							metadata: { section: "layout" },
						},
						background: {
							type: "text",
							metadata: { section: "appearance" },
						},
					},
				},
			},
		});
		renderPanel(
			[<FieldStub key="title" fieldName="title" />, <FieldStub key="width" fieldName="width" />, <FieldStub key="background" fieldName="background" />],
		);

		await waitFor(() =>
			expect(
				screen.getByTestId("ak-inspector-section-fields:Hero:layout"),
			).toBeInTheDocument(),
		);
		expect(
			screen.getByTestId("ak-inspector-section-fields:Hero:appearance"),
		).toBeInTheDocument();
		expect(screen.getByText("Layout")).toBeInTheDocument();
		expect(screen.getByText("Appearance")).toBeInTheDocument();
		// Ungrouped field is not inside any section.
		expect(
			screen
				.getByTestId("field-title")
				.closest("[data-testid^='ak-inspector-section-']"),
		).toBeNull();
		expect(
			screen
				.getByTestId("field-width")
				.closest("[data-testid='ak-inspector-section-fields:Hero:layout']"),
		).not.toBeNull();
	});

	it("orders canonical sections content → actions → appearance → layout → advanced regardless of authoring order", async () => {
		selectHero({
			components: {
				Hero: {
					fields: {
						a: { type: "text", metadata: { section: "advanced" } },
						b: { type: "text", metadata: { section: "content" } },
						c: { type: "text", metadata: { section: "layout" } },
					},
				},
			},
		});
		renderPanel(
			[<FieldStub key="a" fieldName="a" />, <FieldStub key="b" fieldName="b" />, <FieldStub key="c" fieldName="c" />],
		);
		await waitFor(() =>
			expect(
				screen.getByTestId("ak-inspector-section-fields:Hero:content"),
			).toBeInTheDocument(),
		);
		const ids = Array.from(
			document.querySelectorAll("[data-testid^='ak-inspector-section-']"),
		).map((el) => el.getAttribute("data-testid"));
		expect(ids).toEqual([
			"ak-inspector-section-fields:Hero:content",
			"ak-inspector-section-fields:Hero:layout",
			"ak-inspector-section-fields:Hero:advanced",
		]);
	});

	it("collapses the advanced section by default while others start expanded", async () => {
		selectHero({
			components: {
				Hero: {
					fields: {
						w: { type: "number", metadata: { section: "layout" } },
						x: { type: "text", metadata: { section: "advanced" } },
					},
				},
			},
		});
		renderPanel(
			[<FieldStub key="w" fieldName="w" />, <FieldStub key="x" fieldName="x" />],
			"fields-sections-advanced",
		);
		await waitFor(() =>
			expect(
				screen.getByTestId("ak-inspector-section-fields:Hero:advanced"),
			).toBeInTheDocument(),
		);
		const triggers = screen.getAllByRole("button", {
			name: /Layout|Advanced/,
		});
		const layoutTrigger = triggers.find((t) => t.textContent === "Layout");
		const advancedTrigger = triggers.find((t) => t.textContent === "Advanced");
		expect(layoutTrigger).toHaveAttribute("aria-expanded", "true");
		expect(advancedTrigger).toHaveAttribute("aria-expanded", "false");
	});

	it("respects metadata.order within a section and renders custom sections after canonical ones", async () => {
		selectHero({
			components: {
				Hero: {
					fields: {
						second: {
							type: "text",
							metadata: { section: "layout", order: 2 },
						},
						first: {
							type: "text",
							metadata: { section: "layout", order: 1 },
						},
						custom: { type: "text", metadata: { section: "Branding" } },
					},
				},
			},
		});
		renderPanel(
			[<FieldStub key="second" fieldName="second" />, <FieldStub key="first" fieldName="first" />, <FieldStub key="custom" fieldName="custom" />],
		);
		await waitFor(() =>
			expect(
				screen.getByTestId("ak-inspector-section-fields:Hero:Branding"),
			).toBeInTheDocument(),
		);
		// Custom section title falls back to the raw id.
		expect(screen.getByText("Branding")).toBeInTheDocument();
		const layout = screen.getByTestId(
			"ak-inspector-section-fields:Hero:layout",
		);
		const stubs = Array.from(
			layout.querySelectorAll("[data-testid^='field-']"),
		).map((el) => el.getAttribute("data-testid"));
		expect(stubs).toEqual(["field-first", "field-second"]);
		const ids = Array.from(
			document.querySelectorAll("[data-testid^='ak-inspector-section-']"),
		).map((el) => el.getAttribute("data-testid"));
		expect(ids.indexOf("ak-inspector-section-fields:Hero:layout")).toBeLessThan(
			ids.indexOf("ak-inspector-section-fields:Hero:Branding"),
		);
	});
});

describe("FieldsPanel — header", () => {
	it("resolves the display label from config and shows the component icon", () => {
		selectHero({
			components: {
				Hero: {
					label: "Hero Banner",
					metadata: { icon: <svg data-testid="hero-icon" /> },
					fields: {},
				},
			},
		});
		renderPanel(null);
		expect(screen.getByTestId("ak-fields-panel-title").textContent).toBe(
			"Hero Banner",
		);
		expect(screen.getByTestId("ak-fields-panel-icon")).toBeInTheDocument();
		expect(screen.getByTestId("hero-icon")).toBeInTheDocument();
	});

	it("dispatches duplicate and remove through the overflow menu", async () => {
		selectHero({ components: { Hero: { fields: {} } } });
		const dispatch = puckState.dispatch as ReturnType<typeof vi.fn>;
		renderPanel(null);

		fireEvent.click(screen.getByTestId("ak-fields-panel-actions"));
		await waitFor(() =>
			expect(screen.getByText("Duplicate")).toBeInTheDocument(),
		);
		fireEvent.click(screen.getByText("Duplicate"));
		expect(dispatch).toHaveBeenCalledWith({
			type: "duplicate",
			sourceIndex: 0,
			sourceZone: "root:default-zone",
		});

		fireEvent.click(screen.getByTestId("ak-fields-panel-actions"));
		await waitFor(() => expect(screen.getByText("Delete")).toBeInTheDocument());
		fireEvent.click(screen.getByText("Delete"));
		expect(dispatch).toHaveBeenCalledWith({
			type: "remove",
			index: 0,
			zone: "root:default-zone",
		});
	});

	it("offers no overflow menu for the root-only selection", () => {
		puckState = {
			appState: {
				ui: { itemSelector: { index: 0, zone: "root:default-zone" } },
				data: { content: [] },
			},
			config: { components: {} },
			selectedItem: null,
			dispatch: vi.fn(),
		};
		renderPanel(null);
		expect(screen.queryByTestId("ak-fields-panel-actions")).toBeNull();
	});
});

describe("FieldsPanel — nested breadcrumb chain", () => {
	it("walks intermediate ancestors through zones and resolves display labels", () => {
		const hero: MockItem = { type: "Hero", props: { id: "hero-1" } };
		const column: MockItem = { type: "Column", props: { id: "col-1" } };
		puckState = {
			appState: {
				ui: { itemSelector: { index: 0, zone: "hero-1:content" } },
				data: {
					content: [hero],
					zones: { "hero-1:content": [column] },
				},
			},
			config: {
				components: {
					Hero: { label: "Hero Banner", fields: {} },
					Column: { label: "Layout Column", fields: {} },
				},
			},
			selectedItem: column,
			dispatch: vi.fn(),
		};
		render(
			<EditorI18nProvider>
				<EditorUiStoreProvider storeId="fields-breadcrumbs">
					<FieldsPanel
						isLoading={false}
						itemSelector={{ index: 0, zone: "hero-1:content" }}
					>
						{null}
					</FieldsPanel>
				</EditorUiStoreProvider>
			</EditorI18nProvider>,
		);
		expect(screen.getByTestId("ak-fields-panel-title").textContent).toBe(
			"Layout Column",
		);
		const nav = screen.getByRole("navigation");
		expect(nav.textContent).toContain("Root");
		expect(nav.textContent).toContain("Hero Banner");
	});
});
