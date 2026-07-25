/**
 * @file CORE-P1A-005/-006/-007 — inspector framework and sections:
 * field-state computation (value/mixed/unset/unsupported), capability
 * -driven section visibility, commit/reset through the port, invalid
 * -draft retention, multi-select mixed flows, and the ED-INSPECT-002
 * coexistence rule (nothing renders for legacy components or with the
 * feature off).
 */

import type {
	AuthoringStateV1,
	EditorCapabilityMetadata,
} from "@anvilkit/contracts/editor";
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
import { createEditorStore } from "@/state/editor-store-bundle";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import type { StudioPluginContext } from "@/types/plugin";
import { createEmptyAuthoringState } from "../../../editor/index.js";
import { buildLegacyPuckData } from "../../../testing/editor/index.js";
import { createStudioEditorBridge } from "../bridge.js";
import { EditorInspectorMount } from "../inspector/EditorInspectorMount.js";
import { projectProperty, readFieldState } from "../inspector/field-state.js";
import { StudioEditorMount } from "../StudioEditorMount.js";

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

const CAPABLE: EditorCapabilityMetadata = {
	version: "1",
	styleTarget: "root",
	capabilities: {
		layoutItem: true,
		visualStyle: true,
		typography: true,
	},
};

function createCtx(): StudioPluginContext {
	let data = buildLegacyPuckData();
	const config = {
		components: {
			Hero: { metadata: { editor: CAPABLE } },
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
				dispatch: (action: { data?: typeof data }) => {
					if (action.data !== undefined) {
						data = action.data;
					}
				},
				getItemById: (id: string) =>
					id.startsWith("plain")
						? { type: "Legacy", props: { id } }
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
async function mountInspector(selection: readonly string[]) {
	const bridge = createStudioEditorBridge();
	storeSeq += 1;
	const storeId = `inspector-test-${storeSeq}`;
	render(
		<EditorI18nProvider>
			<StudioPluginContextProvider value={createCtx()}>
				<EditorStoreProvider
					storeId={storeId}
					store={createEditorStore({ storeId })}
				>
					<StudioEditorMount
						editor={{ features: { enabled: true } }}
						bridge={bridge}
					>
						<EditorInspectorMount />
					</StudioEditorMount>
				</EditorStoreProvider>
			</StudioPluginContextProvider>
		</EditorI18nProvider>,
	);
	await waitFor(() => expect(bridge.port).not.toBeNull());
	act(() => {
		bridge.selection?.selectMany(selection);
	});
	return bridge;
}

describe("universal inspector sections (CORE-P1A-005/-006/-007)", () => {
	it("renders capability-driven sections for a capable selection", async () => {
		await mountInspector(["legacy-0"]);
		await waitFor(() => {
			expect(screen.getByTestId("ak-editor-inspector")).toBeTruthy();
		});
		expect(screen.getByTestId("ak-layout-section")).toBeTruthy();
		expect(screen.getByTestId("ak-style-section")).toBeTruthy();
		expect(screen.getByTestId("ak-typography-section")).toBeTruthy();
	});

	it("renders nothing for legacy components (ED-INSPECT-002)", async () => {
		await mountInspector(["plain-0"]);
		// The lazy chunk resolves; the panel then bails on capabilities.
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(screen.queryByTestId("ak-editor-inspector")).toBeNull();
	});

	it("renders nothing when the editor feature is off", async () => {
		render(
			<EditorI18nProvider>
				<StudioPluginContextProvider value={createCtx()}>
					<StudioEditorMount
						editor={undefined}
						bridge={createStudioEditorBridge()}
					>
						<EditorInspectorMount />
					</StudioEditorMount>
				</StudioPluginContextProvider>
			</EditorI18nProvider>,
		);
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(screen.queryByTestId("ak-editor-inspector")).toBeNull();
	});

	it("commits a layout write through the port and supports reset-at-layer", async () => {
		const bridge = await mountInspector(["legacy-0"]);
		await waitFor(() =>
			expect(screen.getByTestId("ak-layout-zindex")).toBeTruthy(),
		);

		const zIndex = screen.getByTestId("ak-layout-zindex");
		fireEvent.change(zIndex, { target: { value: "5" } });
		fireEvent.blur(zIndex);
		await waitFor(() => {
			const snapshot = bridge.port?.getSnapshot();
			expect(snapshot?.authoring.nodes["legacy-0"]?.layout?.base).toMatchObject({
				zIndex: 5,
			});
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
		const bridge = await mountInspector(["legacy-0", "legacy-1"]);
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
