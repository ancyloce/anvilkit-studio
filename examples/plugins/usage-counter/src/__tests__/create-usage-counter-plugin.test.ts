import {
	StudioConfigSchema,
	compilePlugins,
} from "@anvilkit/core";
import type {
	StudioPluginContext,
} from "@anvilkit/core/types";
import type { Data as PuckData } from "@puckeditor/core";
import { describe, expect, it, vi } from "vitest";

import { createUsageCounterPlugin } from "../create-usage-counter-plugin.js";

const studioConfig = StudioConfigSchema.parse({});

function makeData(overrides: Partial<PuckData> = {}): PuckData {
	return {
		root: { props: {} },
		content: [],
		zones: {},
		...overrides,
	};
}

function makeCtx(data: PuckData = makeData()): StudioPluginContext {
	return {
		getData: () => data,
		getPuckApi: (() => {
			throw new Error("getPuckApi unused in this test");
		}) as unknown as StudioPluginContext["getPuckApi"],
		studioConfig,
		log: vi.fn(),
		emit: vi.fn(),
	};
}

describe("createUsageCounterPlugin", () => {
	it("declares the expected plugin meta", () => {
		const plugin = createUsageCounterPlugin();

		expect(plugin.meta.id).toBe("anvilkit-example-usage-counter");
		expect(plugin.meta.coreVersion).toBe("^0.1.0-alpha");
		expect(plugin.meta.description).toEqual(expect.any(String));
	});

	it("compiles via compilePlugins and registers a header action", async () => {
		const runtime = await compilePlugins(
			[createUsageCounterPlugin()],
			makeCtx(),
		);

		expect(runtime.pluginMeta.map((m) => m.id)).toEqual([
			"anvilkit-example-usage-counter",
		]);
		expect(runtime.headerActions).toHaveLength(1);
		expect(runtime.headerActions[0]?.id).toBe("usage-counter-log");
	});

	it("counts content items and zone items on each onDataChange", async () => {
		const plugin = createUsageCounterPlugin();
		const data = makeData({
			content: [
				{ type: "Hero", props: { id: "hero-1" } },
				{ type: "Button", props: { id: "btn-1" } },
				{ type: "Button", props: { id: "btn-2" } },
			],
			zones: {
				"footer:children": [{ type: "Button", props: { id: "btn-3" } }],
			},
		});
		const ctx = makeCtx(data);
		const runtime = await compilePlugins([plugin], ctx);

		await runtime.lifecycle.emit("onInit", ctx);
		await runtime.lifecycle.emit("onDataChange", ctx, data);

		expect(plugin.getCounts()).toEqual({ Hero: 1, Button: 3 });
	});

	it("emits 'usage-counter:update' through the plugin event bus", async () => {
		const plugin = createUsageCounterPlugin();
		const data = makeData({
			content: [{ type: "Hero", props: { id: "hero-1" } }],
		});
		const ctx = makeCtx(data);
		const runtime = await compilePlugins([plugin], ctx);

		await runtime.lifecycle.emit("onInit", ctx);
		await runtime.lifecycle.emit("onDataChange", ctx, data);

		expect(ctx.emit).toHaveBeenCalledWith("usage-counter:update", {
			Hero: 1,
		});
	});

	it("supports subscribe/unsubscribe for reactive listeners", async () => {
		const plugin = createUsageCounterPlugin();
		const observed: Array<Record<string, number>> = [];
		const unsubscribe = plugin.subscribe((counts) => {
			observed.push({ ...counts });
		});

		const data = makeData({
			content: [{ type: "Hero", props: { id: "hero-1" } }],
		});
		const ctx = makeCtx(data);
		const runtime = await compilePlugins([plugin], ctx);
		await runtime.lifecycle.emit("onInit", ctx);

		unsubscribe();
		await runtime.lifecycle.emit("onDataChange", ctx, data);

		expect(observed).toEqual([{ Hero: 1 }]);
	});

	it("verbose option logs the latest counts", async () => {
		const plugin = createUsageCounterPlugin({ verbose: true });
		const data = makeData({
			content: [{ type: "Hero", props: { id: "hero-1" } }],
		});
		const ctx = makeCtx(data);
		const runtime = await compilePlugins([plugin], ctx);

		await runtime.lifecycle.emit("onInit", ctx);

		expect(ctx.log).toHaveBeenCalledWith("debug", "usage-counter:update", {
			counts: { Hero: 1 },
		});
	});
});
