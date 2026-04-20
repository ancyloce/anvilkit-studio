import { StudioConfigSchema, compilePlugins } from "@anvilkit/core";
import type { StudioPluginContext } from "@anvilkit/core/types";
import type { Data as PuckData } from "@puckeditor/core";
import { describe, expect, it, vi } from "vitest";

import { createExportJsonPlugin } from "../create-export-json-plugin.js";

const studioConfig = StudioConfigSchema.parse({});

function makeCtx(data?: PuckData): StudioPluginContext {
	return {
		getData: () => data ?? { root: { props: {} }, content: [], zones: {} },
		getPuckApi: (() => {
			throw new Error("getPuckApi unused in this test");
		}) as unknown as StudioPluginContext["getPuckApi"],
		studioConfig,
		log: vi.fn(),
		emit: vi.fn(),
	};
}

describe("createExportJsonPlugin", () => {
	it("declares the expected plugin meta", () => {
		const plugin = createExportJsonPlugin();

		expect(plugin.meta.id).toBe("anvilkit-example-export-json");
		expect(plugin.meta.coreVersion).toBe("^0.1.0-alpha");
	});

	it("registers exactly the json export format via compilePlugins", async () => {
		const runtime = await compilePlugins(
			[createExportJsonPlugin()],
			makeCtx(),
		);

		expect(runtime.pluginMeta.map((m) => m.id)).toEqual([
			"anvilkit-example-export-json",
		]);
		expect([...runtime.exportFormats.keys()]).toEqual(["json"]);
		const registered = runtime.exportFormats.get("json");
		expect(registered?.mimeType).toBe("application/json");
		expect(registered?.extension).toBe("json");
	});
});
