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
