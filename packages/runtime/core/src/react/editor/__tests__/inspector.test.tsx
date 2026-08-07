/**
 * @file CORE-P1A-005/-006/-007 — inspector framework and sections:
 * field-state computation (value/mixed/unset/unsupported), capability
 * -driven section visibility, commit/reset through the port, invalid
 * -draft retention, multi-select mixed flows, and the ED-INSPECT-002
 * coexistence rule (nothing renders for legacy components or with the
 * feature off).
 */

import type {
	AnvilComponentMetadata,
	StudioEditorConfig,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
} from "../../../editor/legacy/index.js";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { act, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioConfigSchema } from "@/config/schema";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import { EditorStoreProvider } from "@/state/EditorStoreProvider";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import { createEditorStore } from "@/state/editor-store-bundle";
import type { StudioPluginContext } from "@/types/plugin";
import { createEmptyAuthoringState } from "../../../editor/index.js";
import { buildLegacyPuckData } from "../../../testing/editor/index.js";
import { createStudioEditorBridge } from "../bridge.js";
import { EditorInspectorMount } from "../inspector/EditorInspectorMount.js";
import { projectProperty, readFieldState } from "../inspector/field-state.js";
import { StudioEditorMount } from "../StudioEditorMount.js";
import {
	applyPuckDataAction,
	type PuckDataAction,
} from "./puck-store-double.js";

afterEach(cleanup);

const BP = {
	id: "bp-tablet",
	label: "Tablet",
	maxWidth: 991,
	order: 0,
	enabled: true,
} as const;

function stateWithNodes(nodes: AuthoringStateV1["nodes"]): AuthoringStateV1 {
	return { ...createEmptyAuthoringState(), breakpoints: [BP], nodes };
}

describe("field-state computation (CORE-P1A-005)", () => {
	it("projects a property across base and overrides", () => {
		const projection = projectProperty<string>(
			{
				base: { display: "flex", position: "static" },
				overrides: { "bp-tablet": { display: "block" } },
			},
			"display",
		);
		expect(projection).toEqual({
			base: "flex",
			overrides: { "bp-tablet": "block" },
		});
		expect(
			projectProperty({ base: { display: "flex" } }, "gap"),
		).toBeUndefined();
	});

	it("classifies value / mixed / unset / unsupported", () => {
		const authoring = stateWithNodes({
			"n-1": { version: "1", layout: { base: { display: "flex" } } },
			"n-2": { version: "1", layout: { base: { display: "flex" } } },
			"n-3": { version: "1", layout: { base: { display: "grid" } } },
		});
		const base = {
			authoring,
			family: "layout" as const,
			property: "display",
			layer: "base" as const,
			breakpoints: authoring.breakpoints,
			viewportWidth: 1280,
		};

		const agreeing = readFieldState<string>({
			...base,
			nodeIds: ["n-1", "n-2"],
		});
		expect(agreeing).toMatchObject({
			kind: "value",
			value: "flex",
			writtenAtLayer: true,
		});

		expect(
			readFieldState<string>({ ...base, nodeIds: ["n-1", "n-3"] }).kind,
		).toBe("mixed");
		expect(
			readFieldState<string>({
				...base,
				property: "overflow",
				nodeIds: ["n-1"],
			}).kind,
		).toBe("unset");
		expect(readFieldState<string>({ ...base, nodeIds: [] }).kind).toBe(
			"unsupported",
		);
	});

	it("shows inherited base values (not written) at a breakpoint layer", () => {
		const authoring = stateWithNodes({
			"n-1": { version: "1", layout: { base: { display: "flex" } } },
		});
		const state = readFieldState<string>({
			authoring,
			nodeIds: ["n-1"],
			family: "layout",
			property: "display",
			layer: "bp-tablet",
			breakpoints: authoring.breakpoints,
			viewportWidth: 768,
		});
		expect(state).toMatchObject({
			kind: "value",
			value: "flex",
			writtenAtLayer: false,
		});
		if (state.kind === "value") {
			expect(state.resolved.source).toBe("base");
		}
	});
});

// ---------------------------------------------------------------------------
// Mounted panel flows.
// ---------------------------------------------------------------------------

const CAPABLE: AnvilComponentMetadata = {
	styleTargets: {
		root: {
			label: "Target",
			properties: ["width", "height", "margin", "background", "borderRadius", "boxShadow", "opacity", "fontSize", "fontWeight", "color", "textAlign"],
		},
	},
};

/** Everything `Hero` declares, plus the data and animation families. */
const RICH: AnvilComponentMetadata = {
	styleTargets: {
		root: {
			label: "Target",
			properties: ["width", "background", "fontSize"],
		},
	},
	interactions: true,
	bindings: true,
};

function createCtx(): StudioPluginContext {
	let data = buildLegacyPuckData();
	const config = {
		components: {
			Hero: { metadata: { anvilkit: { editor: CAPABLE } } },
			Rich: { metadata: { anvilkit: { editor: RICH } } },
			Legacy: {},
		},
	};
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
				dispatch: (action: PuckDataAction) => {
					data = applyPuckDataAction(data, action);
				},
				getItemById: (id: string) =>
					id.startsWith("plain")
						? { type: "Legacy", props: { id } }
						: id.startsWith("rich")
							? { type: "Rich", props: { id } }
							: { type: "Hero", props: { id } },
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

/**
 * Mount the inspector with the editor on. The universal sections now
 * live behind the `style` / `data` / `animation` tabs, so every test
 * that wants one opens its tab first — `properties` (the native field
 * tree) is what mounts by default.
 */
async function mountInspector(
	selection: readonly string[],
	options: {
		readonly properties?: ReactNode;
		readonly storeId?: string;
		readonly editor?: StudioEditorConfig;
	} = {},
) {
	const bridge = createStudioEditorBridge();
	storeSeq += 1;
	const storeId = options.storeId ?? `inspector-test-${storeSeq}`;
	const view = render(
		<EditorI18nProvider>
			<StudioPluginContextProvider value={createCtx()}>
				<EditorStoreProvider
					storeId={storeId}
					store={createEditorStore({ storeId })}
				>
					<StudioEditorMount
						editor={options.editor ?? { features: { enabled: true } }}
						bridge={bridge}
					>
						<EditorInspectorMount properties={options.properties} />
					</StudioEditorMount>
				</EditorStoreProvider>
			</StudioPluginContextProvider>
		</EditorI18nProvider>,
	);
	await waitFor(() => expect(bridge.port).not.toBeNull());
	act(() => {
		bridge.selection?.selectMany(selection);
	});
	return { bridge, view };
}

/**
 * Click a tab and wait until its panel is the only one mounted. The
 * shared tabs primitive wraps each panel in `AnimatePresence`, so the
 * outgoing panel survives one extra frame before it is removed.
 */
async function openTab(tab: "style" | "properties" | "data" | "animation") {
	fireEvent.click(screen.getByTestId(`ak-inspector-tab-${tab}`));
	await waitFor(() => {
		expect(screen.getByTestId(`ak-inspector-tab-${tab}`)).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(screen.getByTestId(`ak-inspector-panel-${tab}`)).toBeTruthy();
		expect(document.querySelectorAll("[role='tabpanel']")).toHaveLength(1);
	});
}

describe("universal inspector sections (CORE-P1A-005/-006/-007)", () => {
	it("renders capability-driven sections under the style tab", async () => {
		await mountInspector(["legacy-0"]);
		await waitFor(() => {
			expect(screen.getByTestId("ak-editor-inspector")).toBeTruthy();
		});
		await openTab("style");
		expect(screen.getByTestId("ak-layout-section")).toBeTruthy();
		expect(screen.getByTestId("ak-style-section")).toBeTruthy();
		expect(screen.getByTestId("ak-typography-section")).toBeTruthy();
	});

	it("renders no editor section for legacy components (ED-INSPECT-002)", async () => {
		await mountInspector(["plain-0"]);
		await waitFor(() => {
			expect(screen.getByTestId("ak-editor-inspector")).toBeTruthy();
		});
		await openTab("style");
		// The tab stays reachable; what a legacy component gets is the
		// localized empty state, never a control it never opted into.
		expect(screen.getByTestId("ak-inspector-empty-style")).toBeTruthy();
		expect(screen.queryByTestId("ak-layout-section")).toBeNull();
		expect(screen.queryByTestId("ak-style-section")).toBeNull();
		expect(screen.queryByTestId("ak-typography-section")).toBeNull();
	});

	it("renders nothing but the native fields when the editor feature is off", async () => {
		render(
			<EditorI18nProvider>
				<StudioPluginContextProvider value={createCtx()}>
					<StudioEditorMount
						editor={undefined}
						bridge={createStudioEditorBridge()}
					>
						<EditorInspectorMount
							properties={<div data-testid="native-fields" />}
						/>
					</StudioEditorMount>
				</StudioPluginContextProvider>
			</EditorI18nProvider>,
		);
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(screen.queryByTestId("ak-editor-inspector")).toBeNull();
		expect(screen.queryByTestId("ak-inspector-tabs")).toBeNull();
		expect(screen.getByTestId("native-fields")).toBeTruthy();
	});

	it("commits a layout write through the port and supports reset-at-layer", async () => {
		const { bridge } = await mountInspector(["legacy-0"]);
		await openTab("style");
		await waitFor(() =>
			expect(screen.getByTestId("ak-layout-zindex")).toBeTruthy(),
		);

		const zIndex = screen.getByTestId("ak-layout-zindex");
		fireEvent.change(zIndex, { target: { value: "5" } });
		fireEvent.blur(zIndex);
		await waitFor(() => {
			const snapshot = bridge.port?.getSnapshot();
			expect(snapshot?.authoring.nodes["legacy-0"]?.layout?.base).toMatchObject(
				{
					zIndex: 5,
				},
			);
		});
		expect(bridge.port?.getSnapshot().revision).toBe(1);

		// Reset-at-layer removes the property again (D-8 null patch).
		await waitFor(() =>
			expect(
				screen.getAllByTestId("ak-inspector-reset").length,
			).toBeGreaterThan(0),
		);
		fireEvent.click(screen.getAllByTestId("ak-inspector-reset")[0] as Element);
		await waitFor(() => {
			const snapshot = bridge.port?.getSnapshot();
			expect(snapshot?.authoring.nodes["legacy-0"]).toBeUndefined();
		});
	});

	it("keeps invalid drafts local (§11.3) and shows mixed for divergent selections", async () => {
		const { bridge } = await mountInspector(["legacy-0", "legacy-1"]);
		await openTab("style");
		await waitFor(() =>
			expect(screen.getByTestId("ak-layout-zindex")).toBeTruthy(),
		);

		// Invalid draft: nothing commits.
		const zIndex = screen.getByTestId("ak-layout-zindex");
		fireEvent.change(zIndex, { target: { value: "abc" } });
		fireEvent.blur(zIndex);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(bridge.port?.getSnapshot().revision).toBe(0);
		expect((zIndex as HTMLInputElement).value).toBe("abc");

		// Divergent values → the mixed placeholder renders.
		await act(async () => {
			await bridge.port?.execute({
				id: "seed",
				expectedRevision: 0,
				source: "plugin",
				timestamp: 1,
				type: "node.layout.set",
				nodeIds: ["legacy-0"],
				breakpointId: "base",
				patch: { zIndex: 9 },
			});
		});
		await waitFor(() => {
			expect(
				screen.getAllByTestId("ak-inspector-mixed").length,
			).toBeGreaterThan(0);
		});
	});
});

// ---------------------------------------------------------------------------
// The four-tab inspector.
// ---------------------------------------------------------------------------

describe("inspector tabs — style / properties / data / animation", () => {
	it("opens on properties, with the native field tree and no editor sections", async () => {
		await mountInspector(["legacy-0"], {
			properties: <div data-testid="native-fields" />,
		});
		await waitFor(() =>
			expect(screen.getByTestId("ak-inspector-tabs")).toBeTruthy(),
		);

		expect(screen.getByTestId("ak-inspector-tab-properties")).toHaveAttribute(
			"aria-selected",
			"true",
		);
		for (const other of ["style", "data", "animation"] as const) {
			expect(screen.getByTestId(`ak-inspector-tab-${other}`)).toHaveAttribute(
				"aria-selected",
				"false",
			);
		}
		expect(screen.getByTestId("ak-inspector-panel-properties")).toBeTruthy();
		expect(screen.getByTestId("native-fields")).toBeTruthy();
		// Native fields live under `properties` and nowhere else.
		expect(
			screen
				.getByTestId("native-fields")
				.closest("[data-testid='ak-inspector-panel-properties']"),
		).not.toBeNull();
		expect(screen.queryByTestId("ak-layout-section")).toBeNull();
	});

	it("renders the four tabs in the declared order", async () => {
		await mountInspector(["legacy-0"]);
		await waitFor(() =>
			expect(screen.getByTestId("ak-inspector-tabs")).toBeTruthy(),
		);
		const ids = Array.from(
			screen
				.getByTestId("ak-inspector-tabs")
				.querySelectorAll("[data-testid^='ak-inspector-tab-']"),
		).map((element) => element.getAttribute("data-testid"));
		expect(ids).toEqual([
			"ak-inspector-tab-style",
			"ak-inspector-tab-properties",
			"ak-inspector-tab-data",
			"ak-inspector-tab-animation",
		]);
	});

	it("shows layout / style / typography under style, and hides the other panels", async () => {
		await mountInspector(["legacy-0"], {
			properties: <div data-testid="native-fields" />,
		});
		await openTab("style");
		expect(screen.getByTestId("ak-inspector-panel-style")).toBeTruthy();
		expect(screen.getByTestId("ak-layout-section")).toBeTruthy();
		expect(screen.getByTestId("ak-style-section")).toBeTruthy();
		expect(screen.getByTestId("ak-typography-section")).toBeTruthy();
		expect(screen.queryByTestId("ak-inspector-panel-properties")).toBeNull();
		expect(screen.queryByTestId("native-fields")).toBeNull();
		expect(screen.queryByTestId("ak-inspector-panel-data")).toBeNull();
		expect(screen.queryByTestId("ak-inspector-panel-animation")).toBeNull();
	});

	it("shows the localized data empty state when the component declares no bindings", async () => {
		await mountInspector(["legacy-0"]);
		await openTab("data");
		expect(screen.getByTestId("ak-inspector-panel-data")).toBeTruthy();
		const empty = screen.getByTestId("ak-inspector-empty-data");
		expect(empty.textContent).toBe(
			"This component does not support data bindings.",
		);
		expect(screen.queryByTestId("ak-bindings-section")).toBeNull();
	});

	it("shows the localized animation empty state when the component declares no interactions", async () => {
		await mountInspector(["legacy-0"]);
		await openTab("animation");
		expect(screen.getByTestId("ak-inspector-panel-animation")).toBeTruthy();
		expect(screen.getByTestId("ak-inspector-empty-animation").textContent).toBe(
			"This component does not support interactions.",
		);
		expect(screen.queryByTestId("ak-interactions-section")).toBeNull();
	});

	it("renders the bindings and interactions editors for a capable component", async () => {
		await mountInspector(["rich-0"], {
			editor: {
				features: { enabled: true },
				dataSourceAdapter: {
					listSources: async () => [{ id: "s1", name: "Products" }],
					getSchema: async () => ({ type: "object" }),
					getPreviewData: async () => ({ status: "data", value: { rows: [] } }),
				},
			},
		});
		await openTab("data");
		await waitFor(() =>
			expect(screen.getByTestId("ak-bindings-section")).toBeTruthy(),
		);
		expect(screen.queryByTestId("ak-inspector-empty-data")).toBeNull();

		await openTab("animation");
		await waitFor(() =>
			expect(screen.getByTestId("ak-interactions-section")).toBeTruthy(),
		);
		expect(screen.queryByTestId("ak-inspector-empty-animation")).toBeNull();
	});

	it("restores the native field tree when properties is reselected", async () => {
		await mountInspector(["legacy-0"], {
			properties: <div data-testid="native-fields" />,
		});
		await openTab("style");
		expect(screen.queryByTestId("native-fields")).toBeNull();
		await openTab("properties");
		await waitFor(() =>
			expect(screen.getByTestId("native-fields")).toBeTruthy(),
		);
		expect(screen.queryByTestId("ak-layout-section")).toBeNull();
	});

	it("dispatches no command and records no history when switching tabs", async () => {
		const { bridge } = await mountInspector(["legacy-0"]);
		const port = bridge.port;
		expect(port).not.toBeNull();
		const execute = vi.spyOn(port as NonNullable<typeof port>, "execute");
		const before = port?.getSnapshot().revision;

		await openTab("style");
		await openTab("data");
		await openTab("animation");
		await openTab("properties");

		expect(execute).not.toHaveBeenCalled();
		expect(port?.getSnapshot().revision).toBe(before);
		execute.mockRestore();
	});

	it("keeps the active tab when the selection changes", async () => {
		const { bridge } = await mountInspector(["legacy-0"]);
		await openTab("style");
		act(() => {
			bridge.selection?.selectMany(["legacy-1"]);
		});
		await waitFor(() =>
			expect(screen.getByTestId("ak-inspector-tab-style")).toHaveAttribute(
				"aria-selected",
				"true",
			),
		);
		expect(screen.getByTestId("ak-inspector-panel-style")).toBeTruthy();
	});

	it("starts a new Studio mount back on properties", async () => {
		const storeId = "inspector-tab-remount";
		const first = await mountInspector(["legacy-0"], { storeId });
		await openTab("data");
		first.view.unmount();
		cleanup();

		await mountInspector(["legacy-0"], { storeId });
		await waitFor(() =>
			expect(screen.getByTestId("ak-inspector-tab-properties")).toHaveAttribute(
				"aria-selected",
				"true",
			),
		);
		expect(screen.getByTestId("ak-inspector-tab-data")).toHaveAttribute(
			"aria-selected",
			"false",
		);
	});

	it("moves between tabs with Left/Right, Home and End", async () => {
		await mountInspector(["legacy-0"]);
		await waitFor(() =>
			expect(screen.getByTestId("ak-inspector-tabs")).toBeTruthy(),
		);
		const style = screen.getByTestId("ak-inspector-tab-style");
		const properties = screen.getByTestId("ak-inspector-tab-properties");
		const animation = screen.getByTestId("ak-inspector-tab-animation");

		properties.focus();
		expect(document.activeElement).toBe(properties);

		fireEvent.keyDown(properties, { key: "ArrowLeft" });
		await waitFor(() => expect(document.activeElement).toBe(style));

		fireEvent.keyDown(style, { key: "ArrowRight" });
		await waitFor(() => expect(document.activeElement).toBe(properties));

		fireEvent.keyDown(properties, { key: "End" });
		await waitFor(() => expect(document.activeElement).toBe(animation));

		fireEvent.keyDown(animation, { key: "Home" });
		await waitFor(() => expect(document.activeElement).toBe(style));
	});

	it("keeps the tab strip outside the scrolling body", async () => {
		// DESIGN.md §7.8 "only the body scrolls": the strip is a shrink-0
		// flex sibling of the scroll container, never inside it, so a long
		// Style tab cannot scroll the tabs out of reach.
		await mountInspector(["legacy-0"]);
		await waitFor(() =>
			expect(screen.getByTestId("ak-inspector-tabs")).toBeTruthy(),
		);
		const tabs = screen.getByTestId("ak-inspector-tabs");
		const panel = screen.getByTestId("ak-inspector-panel-properties");
		const scroller = panel.parentElement as HTMLElement;
		expect(scroller.className).toContain("overflow-auto");
		expect(scroller.contains(tabs)).toBe(false);
		expect(tabs.className).toContain("shrink-0");
	});

	it("associates every tab with its panel and announces only the active one", async () => {
		await mountInspector(["legacy-0"]);
		await waitFor(() =>
			expect(screen.getByTestId("ak-inspector-tabs")).toBeTruthy(),
		);
		const list = screen.getByTestId("ak-inspector-tabs");
		expect(list.getAttribute("role")).toBe("tablist");
		expect(list.getAttribute("aria-label")).toBe("Inspector sections");

		const active = screen.getByTestId("ak-inspector-tab-properties");
		const panel = screen.getByTestId("ak-inspector-panel-properties");
		expect(panel.getAttribute("role")).toBe("tabpanel");
		expect(panel.getAttribute("aria-labelledby")).toBe(
			active.getAttribute("id"),
		);
		// The three inactive panels are not in the tree at all, so nothing
		// hidden is focusable or announced.
		expect(document.querySelectorAll("[role='tabpanel']")).toHaveLength(1);
	});

	it("labels the tabs in English, Chinese, Japanese and Korean", async () => {
		const expected: Record<string, readonly string[]> = {
			en: ["Style", "Properties", "Data", "Animation"],
			zh: ["样式", "属性", "数据", "动画"],
			ja: ["スタイル", "プロパティ", "データ", "アニメーション"],
			ko: ["스타일", "속성", "데이터", "애니메이션"],
		};
		for (const [locale, labels] of Object.entries(expected)) {
			const bridge = createStudioEditorBridge();
			storeSeq += 1;
			const storeId = `inspector-locale-${locale}-${storeSeq}`;
			const bundle = createEditorStore({ storeId });
			// The i18n provider sits INSIDE the store provider here: it reads
			// the active locale from the locale slice, so wrapping it the
			// other way round would pin the chrome to English.
			render(
				<StudioPluginContextProvider value={createCtx()}>
					<EditorStoreProvider storeId={storeId} store={bundle}>
						<EditorI18nProvider>
							<StudioEditorMount
								editor={{ features: { enabled: true } }}
								bridge={bridge}
							>
								<EditorInspectorMount />
							</StudioEditorMount>
						</EditorI18nProvider>
					</EditorStoreProvider>
				</StudioPluginContextProvider>,
			);
			await waitFor(() => expect(bridge.port).not.toBeNull());
			act(() => {
				bridge.selection?.selectMany(["legacy-0"]);
				bundle.locale.getState().setLocale(locale);
			});
			await waitFor(() => {
				expect(screen.getByTestId("ak-inspector-tab-style").textContent).toBe(
					labels[0],
				);
			});
			expect(
				screen.getByTestId("ak-inspector-tab-properties").textContent,
			).toBe(labels[1]);
			expect(screen.getByTestId("ak-inspector-tab-data").textContent).toBe(
				labels[2],
			);
			expect(screen.getByTestId("ak-inspector-tab-animation").textContent).toBe(
				labels[3],
			);
			cleanup();
		}
	});
});
