/**
 * @file CORE-P1A-004 — `EditorEvent` emission through the mounted
 * editor root: `command.committed` / `command.rejected` fire per
 * intent, every payload passes the shared content-free assertion
 * (DD-0019 §22.4/§29), and the read-only sidecar surfaces as a
 * persistent diagnostic.
 */

import type { EditorEvent } from "@anvilkit/contracts/editor";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioConfigSchema } from "@/config/schema";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import type { StudioPluginContext } from "@/types/plugin";
import {
	assertContentFreeEvent,
	buildLegacyPuckData,
	buildPuckDataWithSidecar,
	buildUnknownVersionSidecar,
} from "../../../testing/editor/index.js";
import { createStudioEditorBridge } from "../bridge.js";
import { StudioEditorMount } from "../StudioEditorMount.js";

afterEach(cleanup);

function createCtx(initialData = buildLegacyPuckData()): StudioPluginContext {
	let data = initialData;
	return {
		getData: () => data,
		getPuckApi: () =>
			({
				appState: {
					get data() {
						return data;
					},
				},
				dispatch: (action: { data?: typeof data }) => {
					if (action.data !== undefined) {
						data = action.data;
					}
				},
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

async function mountEditor(ctx: StudioPluginContext) {
	const bridge = createStudioEditorBridge();
	render(
		<StudioPluginContextProvider value={ctx}>
			<StudioEditorMount
				editor={{ features: { enabled: true } }}
				bridge={bridge}
			>
				<span />
			</StudioEditorMount>
		</StudioPluginContextProvider>,
	);
	await waitFor(() => expect(bridge.port).not.toBeNull());
	return bridge;
}

describe("editor event emission (CORE-P1A-004)", () => {
	it("emits content-free command.committed and command.rejected", async () => {
		const bridge = await mountEditor(createCtx());
		const events: EditorEvent[] = [];
		bridge.diagnostics.subscribe((event) => events.push(event));

		const port = bridge.port;
		if (port === null) throw new Error("port not mounted");

		await port.execute({
			id: "c1",
			expectedRevision: 0,
			source: "inspector",
			timestamp: 1,
			type: "node.rename",
			nodeId: "node-1",
			name: "A very long user-visible node name that must NOT appear",
		});
		await port.execute({
			id: "c2",
			expectedRevision: 99,
			source: "plugin",
			timestamp: 2,
			type: "node.rename",
			nodeId: "node-1",
			name: "B",
		});

		const committed = events.find((e) => e.type === "command.committed");
		const rejected = events.find((e) => e.type === "command.rejected");
		expect(committed).toMatchObject({
			commandType: "node.rename",
			source: "inspector",
			changedNodeCount: 1,
		});
		expect(rejected).toMatchObject({
			commandType: "node.rename",
			errorCodes: ["EDITOR_COMMAND_CONFLICT"],
		});

		// Redaction guarantee: every emission passes the shared
		// content-free assertion — no text, URLs, props, or tokens.
		for (const event of events) {
			assertContentFreeEvent(event);
		}
		const serialized = JSON.stringify(events);
		expect(serialized).not.toContain("user-visible");
		expect(serialized).not.toContain("node-1");
	});

	it("noop executions emit nothing", async () => {
		const bridge = await mountEditor(createCtx());
		const events: EditorEvent[] = [];
		bridge.diagnostics.subscribe((event) => events.push(event));
		const port = bridge.port;
		if (port === null) throw new Error("port not mounted");

		await port.execute({
			id: "c1",
			expectedRevision: 0,
			source: "inspector",
			timestamp: 1,
			type: "node.lock.set",
			nodeIds: ["node-1"],
			locked: false,
		});
		expect(events).toEqual([]);
	});

	it("surfaces an unreadable sidecar as a persistent diagnostic", async () => {
		const bridge = await mountEditor(
			createCtx(buildPuckDataWithSidecar(buildUnknownVersionSidecar())),
		);
		const diagnostics = bridge.diagnostics.getDiagnostics();
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.code).toBe("EDITOR_CONTRACT_UNSUPPORTED_VERSION");
	});

	it("keeps diagnostics empty for a clean document", async () => {
		const bridge = await mountEditor(createCtx());
		expect(bridge.diagnostics.getDiagnostics()).toEqual([]);
	});
});
