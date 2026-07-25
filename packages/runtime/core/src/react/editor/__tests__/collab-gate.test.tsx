/**
 * @file CORE-P1A-013 — collaboration capability type + authoring gate:
 * the gate matrix (declared/undeclared × encodings × editor on/off),
 * the every-plugin diagnostic (most-conservative-wins), preview
 * remaining functional while writers are disabled, and the
 * `compilePlugins` projection (CORE-P0-020 freeze §2).
 */

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioConfigSchema } from "@/config/schema";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import { compilePlugins } from "@/runtime/compile-plugins";
import type { StudioPlugin, StudioPluginContext } from "@/types/plugin";
import { buildLegacyPuckData } from "../../../testing/editor/index.js";
import { createStudioEditorBridge } from "../bridge.js";
import { computeCollabGateError } from "../collab-gate.js";
import { StudioEditorMount } from "../StudioEditorMount.js";

afterEach(cleanup);

describe("computeCollabGateError (CORE-P1A-013)", () => {
	const declare = (pluginName: string, encoding: string) => ({
		pluginName,
		capability: {
			encoding: encoding as "native-tree",
		},
	});

	it("passes with no declarations and with granular-authoring", () => {
		expect(computeCollabGateError([])).toBeNull();
		expect(
			computeCollabGateError([declare("collab-a", "granular-authoring")]),
		).toBeNull();
	});

	it("gates on legacy-document and native-tree encodings", () => {
		for (const encoding of ["legacy-document", "native-tree"] as const) {
			const error = computeCollabGateError([declare("collab-a", encoding)]);
			expect(error?.code).toBe("EDITOR_COLLAB_ENCODING_UNSUPPORTED");
			expect(error?.details?.plugins).toEqual(["collab-a"]);
		}
	});

	it("lists every non-granular declaring plugin (most-conservative-wins)", () => {
		const error = computeCollabGateError([
			declare("collab-a", "granular-authoring"),
			declare("collab-b", "native-tree"),
			declare("collab-c", "legacy-document"),
		]);
		expect(error?.details?.plugins).toEqual(["collab-b", "collab-c"]);
		expect(error?.details?.encodings).toEqual([
			"native-tree",
			"legacy-document",
		]);
	});
});

describe("compilePlugins collab projection (CORE-P0-020 §2)", () => {
	function collabPlugin(id: string): StudioPlugin {
		const meta = {
			id,
			name: id,
			version: "1.0.0",
			coreVersion: "^0.1.0",
			capabilities: {
				sidebar: true,
				collaboration: { encoding: "native-tree" as const },
			},
		};
		return { meta, register: () => ({ meta, hooks: {} }) };
	}

	function plainPlugin(id: string): StudioPlugin {
		const meta = { id, name: id, version: "1.0.0", coreVersion: "^0.1.0" };
		return { meta, register: () => ({ meta, hooks: {} }) };
	}

	function fakeCtx(): StudioPluginContext {
		return {
			getData: () => buildLegacyPuckData(),
			getPuckApi: () => ({}) as ReturnType<StudioPluginContext["getPuckApi"]>,
			studioConfig: StudioConfigSchema.parse({}),
			log: vi.fn(),
			emit: () => undefined,
			on: () => () => undefined,
			t: (key) => key,
			registerMessages: () => undefined,
			registerAssetResolver: () => undefined,
		};
	}

	it("projects declared capabilities without gating at compile time", async () => {
		const runtime = await compilePlugins(
			[collabPlugin("collab/yjs"), plainPlugin("plain/one")],
			fakeCtx(),
		);
		expect(runtime.collabCapabilities).toEqual([
			{
				pluginName: "collab/yjs",
				capability: { encoding: "native-tree" },
			},
		]);
	});

	it("projects an empty list when nothing declares", async () => {
		const runtime = await compilePlugins([plainPlugin("plain/one")], fakeCtx());
		expect(runtime.collabCapabilities).toEqual([]);
	});
});

describe("authoring gate through the mounted editor (CORE-P1A-013)", () => {
	function createCtx(): StudioPluginContext {
		let data = buildLegacyPuckData();
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

	async function mountWithCollab(encoding: string | null) {
		const bridge = createStudioEditorBridge();
		if (encoding !== null) {
			bridge.collabCapabilities = [
				{
					pluginName: "collab/yjs",
					capability: { encoding: encoding as "native-tree" },
				},
			];
		}
		render(
			<StudioPluginContextProvider value={createCtx()}>
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

	const renameCommand = {
		id: "c1",
		expectedRevision: 0,
		source: "inspector",
		timestamp: 1,
		type: "node.rename",
		nodeId: "node-1",
		name: "X",
	} as const;

	it("disables writers and surfaces the persistent diagnostic under native-tree", async () => {
		const bridge = await mountWithCollab("native-tree");
		const port = bridge.port;
		if (port === null) throw new Error("port not mounted");

		const result = await port.execute(renameCommand);
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_COLLAB_ENCODING_UNSUPPORTED");

		// Neither system silently disabled: the diagnostic is persistent
		// and names the plugin…
		const diagnostics = bridge.diagnostics.getDiagnostics();
		expect(diagnostics.map((d) => d.code)).toContain(
			"EDITOR_COLLAB_ENCODING_UNSUPPORTED",
		);
		expect(diagnostics[0]?.details?.plugins).toEqual(["collab/yjs"]);

		// …while reads and preview stay fully functional.
		expect(port.getSnapshot().revision).toBe(0);
		const preview = port.preview(renameCommand);
		expect(preview.valid).toBe(true);
		expect(preview.changedNodeIds).toEqual(["node-1"]);
	});

	it("keeps writers enabled under granular-authoring and with no declaration", async () => {
		for (const encoding of ["granular-authoring", null]) {
			const bridge = await mountWithCollab(encoding);
			const port = bridge.port;
			if (port === null) throw new Error("port not mounted");
			const result = await port.execute(renameCommand);
			expect(result.status).toBe("committed");
			expect(bridge.diagnostics.getDiagnostics()).toEqual([]);
			cleanup();
		}
	});

	it("re-gates when a recompile changes the declared capability list", async () => {
		const bridge = await mountWithCollab(null);
		const port = bridge.port;
		if (port === null) throw new Error("port not mounted");
		expect((await port.execute(renameCommand)).status).toBe("committed");

		// A recompile lands a native-tree transport (controller sync).
		bridge.collabCapabilities = [
			{
				pluginName: "collab/late",
				capability: { encoding: "native-tree" },
			},
		];
		bridge.notify();
		await waitFor(() =>
			expect(bridge.diagnostics.getDiagnostics().map((d) => d.code)).toContain(
				"EDITOR_COLLAB_ENCODING_UNSUPPORTED",
			),
		);
		const blocked = await port.execute({
			...renameCommand,
			id: "c2",
			expectedRevision: 1,
			name: "Y",
		});
		expect(blocked.status).toBe("rejected");
	});
});
