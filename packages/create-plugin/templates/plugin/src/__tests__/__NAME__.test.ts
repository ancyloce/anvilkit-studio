import {
	createFakeStudioContext,
	registerPlugin,
} from "@anvilkit/core/testing";
import { describe, expect, it } from "vitest";

import { __FACTORY__ } from "../index.js";

describe("__FACTORY__", () => {
	it("returns a StudioPlugin with the expected meta", () => {
		const plugin = __FACTORY__();
		expect(plugin.meta.id).toBe("anvilkit-plugin-__NAME__");
		expect(plugin.meta.name).toBe("__DISPLAY__");
	});

	it("logs an info line on onInit", async () => {
		const plugin = __FACTORY__({ label: "hello" });
		const harness = await registerPlugin(plugin);
		await harness.runInit();

		const lastLog = harness.ctx._mocks.logCalls.at(-1);
		expect(lastLog?.[0]).toBe("info");
		expect(lastLog?.[1]).toBe("__DISPLAY__ initialised");
		expect(lastLog?.[2]).toMatchObject({ label: "hello" });
	});

	it("accepts a caller-provided context override", async () => {
		const plugin = __FACTORY__();
		const ctx = createFakeStudioContext({
			getData: () => ({
				root: { props: {} },
				content: [{ type: "Hero", props: { id: "hero-1" } }],
				zones: {},
			}),
		});
		const harness = await registerPlugin(plugin, { ctx });
		expect(harness.ctx.getData().content).toHaveLength(1);
	});
});
