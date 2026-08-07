/**
 * @file CORE-P2-004 — create-component through the port: the whole
 * creation (definition + tree replacement + selection) is **one**
 * history-recording dispatch (DD-0019 §10.5, §14.3; freeze D-3;
 * CFX-C06), and rejected requests dispatch nothing.
 */

import type { AnvilComponentMetadata } from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import { cleanup, render, waitFor } from "@testing-library/react";
import { act, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioConfigSchema } from "@/config/schema";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import { EditorStoreProvider } from "@/state/EditorStoreProvider";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import { createEditorStore } from "@/state/editor-store-bundle";
import type { StudioPluginContext } from "@/types/plugin";
import { createStudioEditorBridge } from "../bridge.js";
import { useCreateComponent } from "../components/use-create-component.js";
import { StudioEditorMount } from "../StudioEditorMount.js";

afterEach(cleanup);

const CAPABLE: AnvilComponentMetadata = {
	styleTargets: {
		root: {
			label: "Target",
			properties: ["display", "gap", "padding", "width", "height", "margin"],
		},
	},
};

const node = (id: string) => ({ type: "Hero", props: { id } });

function seedData(): PuckData {
	return {
		root: { props: {} },
		content: [node("a"), node("b"), node("c")],
		zones: {},
	} as unknown as PuckData;
}

/** Records every history-recording dispatch the port makes. */
function createCtx(recorded: PuckData[]): StudioPluginContext {
	let data = seedData();
	const config = {
		components: { Hero: { metadata: { anvilkit: { editor: CAPABLE } } } },
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

let captured: ReturnType<typeof useCreateComponent> = null;
function Harness(): ReactNode {
	captured = useCreateComponent();
	return null;
}

let storeSeq = 0;
async function mount(recorded: PuckData[]) {
	const bridge = createStudioEditorBridge();
	storeSeq += 1;
	const storeId = `create-component-${storeSeq}`;
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
						<Harness />
					</StudioEditorMount>
				</EditorStoreProvider>
			</StudioPluginContextProvider>
		</EditorI18nProvider>,
	);
	await waitFor(() => expect(bridge.port).not.toBeNull());
	return bridge;
}

describe("useCreateComponent (CORE-P2-004)", () => {
	it("dispatches nothing when the selection is invalid", async () => {
		const recorded: PuckData[] = [];
		const bridge = await mount(recorded);
		act(() => {
			// A locked node cannot be moved into a definition.
			bridge.selection?.selectMany(["a"]);
		});
		await waitFor(() => expect(captured).not.toBeNull());
		await act(async () => {
			await captured?.create("Locked");
		});
		// Sanity: the valid path did commit, so the guard below is real.
		expect(recorded).toHaveLength(1);

		const before = bridge.port?.getSnapshot().revision ?? 0;
		act(() => {
			bridge.selection?.clear();
		});
		let outcome:
			| Awaited<ReturnType<NonNullable<typeof captured>["create"]>>
			| undefined;
		await act(async () => {
			outcome = await captured?.create("Empty");
		});
		expect(outcome?.status).toBe("rejected");
		expect(recorded).toHaveLength(1);
		expect(bridge.port?.getSnapshot().revision).toBe(before);
	});
});
