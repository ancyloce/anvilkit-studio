/**
 * @file CORE-P2-009F/G — the isolated component canvas: it renders
 * only inside a component scope, shows the combination strip and
 * breadcrumb, switches combinations without touching history, and
 * exits back to the page (DD-DEC-010; DD-0019 §14.4, §10.6).
 */

import type {
	ComponentDefinitionV1,
	EditorCapabilityMetadata,
} from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioConfigSchema } from "@/config/schema";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import { EditorStoreProvider } from "@/state/EditorStoreProvider";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import { createEditorStore } from "@/state/editor-store-bundle";
import type { StudioPluginContext } from "@/types/plugin";
import { createStudioEditorBridge } from "../bridge.js";
import { ComponentCanvasPanel } from "../components/ComponentCanvasPanel.js";
import { componentScope } from "../components/scope.js";
import { StudioEditorMount } from "../StudioEditorMount.js";

afterEach(cleanup);

const CAPABLE: EditorCapabilityMetadata = {
	version: "1",
	styleTarget: "root",
	capabilities: { layoutContainer: true },
};

const DEFINITION: ComponentDefinitionV1 = {
	version: "1",
	id: "def",
	name: "Card",
	root: {
		type: "Box",
		props: {
			id: "n-root",
			label: "base",
			children: [{ type: "Text", props: { id: "n-text" } }],
		},
	} as never,
	exposedProps: [],
	variantAxes: [
		{
			id: "size",
			name: "Size",
			options: [
				{ id: "sm", name: "Small" },
				{ id: "lg", name: "Large" },
			],
		},
	],
	variants: [
		{
			id: "v-lg",
			selection: { size: "lg" },
			patch: { "n-root": { props: { label: "large" } } },
		},
	],
	revision: 1,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

function seedData(): PuckData {
	return {
		root: {
			props: {
				__anvilkit: {
					version: "1",
					revision: 0,
					breakpoints: [],
					nodes: {},
					tokens: {},
					tokenModes: {},
					styleDefinitions: {},
					componentDefinitions: { def: DEFINITION },
					interactions: {},
					bindings: {},
				},
			},
		},
		content: [{ type: "Hero", props: { id: "a" } }],
		zones: {},
	} as unknown as PuckData;
}

function createCtx(recorded: PuckData[]): StudioPluginContext {
	let data = seedData();
	const config = { components: { Hero: { metadata: { editor: CAPABLE } } } };
	return {
		getData: () => data,
		getPuckApi: () =>
			({
				appState: {
					get data() {
						return data;
					},
				},
				config,
				dispatch: (action: { data?: PuckData; recordHistory?: boolean }) => {
					if (action.data !== undefined) {
						data = action.data;
						if (action.recordHistory === true) {
							recorded.push(action.data);
						}
					}
				},
				getItemById: (id: string) => ({ type: "Hero", props: { id } }),
				getSelectorForId: () => undefined,
			}) as unknown as ReturnType<StudioPluginContext["getPuckApi"]>,
		studioConfig: StudioConfigSchema.parse({}),
		log: vi.fn(),
		emit: () => undefined,
		on: () => () => undefined,
		t: (key) => key,
		registerMessages: () => undefined,
		registerAssetResolver: () => undefined,
	};
}

let storeSeq = 0;
async function mount(recorded: PuckData[] = []) {
	const bridge = createStudioEditorBridge();
	storeSeq += 1;
	const storeId = `component-canvas-${storeSeq}`;
	render(
		<EditorI18nProvider>
			<StudioPluginContextProvider value={createCtx(recorded)}>
				<EditorStoreProvider
					storeId={storeId}
					store={createEditorStore({ storeId })}
				>
					<StudioEditorMount
						editor={{ features: { enabled: true } }}
						bridge={bridge}
					>
						<ComponentCanvasPanel />
					</StudioEditorMount>
				</EditorStoreProvider>
			</StudioPluginContextProvider>
		</EditorI18nProvider>,
	);
	await waitFor(() => expect(bridge.port).not.toBeNull());
	return bridge;
}

describe("ComponentCanvasPanel (CORE-P2-009F/G)", () => {
	it("renders nothing in page scope", async () => {
		await mount();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(screen.queryByTestId("ak-component-canvas")).toBeNull();
	});

	it("renders the definition and its combination strip in component scope", async () => {
		const bridge = await mount();
		act(() => {
			bridge.selection?.setScope(componentScope("def"));
		});
		await waitFor(() =>
			expect(screen.getByTestId("ak-component-canvas")).toBeTruthy(),
		);
		expect(screen.getByTestId("ak-component-name").textContent).toBe("Card");
		// Main + one tab per expressible combination.
		expect(screen.getAllByTestId("ak-component-variant-tab")).toHaveLength(3);
		// The scoped layer list shows the definition's nodes (009G).
		expect(screen.getAllByTestId("ak-component-layer-row")).toHaveLength(2);
	});

	it("switches combinations without recording history", async () => {
		const recorded: PuckData[] = [];
		const bridge = await mount(recorded);
		act(() => {
			bridge.selection?.setScope(componentScope("def"));
		});
		await waitFor(() =>
			expect(screen.getByTestId("ak-component-variant-strip")).toBeTruthy(),
		);
		const tabs = screen.getAllByTestId("ak-component-variant-tab");
		const large = tabs.find((tab) => tab.textContent?.includes("Large"));
		fireEvent.click(large as Element);
		await waitFor(() =>
			expect(large?.getAttribute("aria-selected")).toBe("true"),
		);
		// Scope and combination are transient UI state (freeze §6).
		expect(recorded).toHaveLength(0);
	});

	it("exits back to page scope and stops rendering", async () => {
		const bridge = await mount();
		act(() => {
			bridge.selection?.setScope(componentScope("def"));
		});
		await waitFor(() =>
			expect(screen.getByTestId("ak-component-exit")).toBeTruthy(),
		);
		fireEvent.click(screen.getByTestId("ak-component-exit"));
		await waitFor(() =>
			expect(screen.queryByTestId("ak-component-canvas")).toBeNull(),
		);
		expect(bridge.selection?.getState().scope).toBe("page");
	});

	it("renders nothing for a scope whose definition is gone", async () => {
		const bridge = await mount();
		act(() => {
			bridge.selection?.setScope(componentScope("missing"));
		});
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(screen.queryByTestId("ak-component-canvas")).toBeNull();
	});
});
