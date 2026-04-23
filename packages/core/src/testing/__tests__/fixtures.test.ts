import { describe, expect, it } from "vitest";

import {
	createFakePageIR,
	createFakeStudioContext,
	registerPlugin,
} from "../index.js";
import type { StudioPlugin } from "../../types/plugin.js";

describe("createFakeStudioContext", () => {
	it("returns defaults matching StudioPluginContext shape", () => {
		const ctx = createFakeStudioContext();
		expect(ctx.getData().content).toEqual([]);
		expect(typeof ctx.log).toBe("function");
		expect(typeof ctx.emit).toBe("function");
	});

	it("records log calls on _mocks.logCalls", () => {
		const ctx = createFakeStudioContext();
		ctx.log("info", "hello", { a: 1 });
		expect(ctx._mocks.logCalls).toEqual([["info", "hello", { a: 1 }]]);
	});

	it("records emit calls on _mocks.emitCalls", () => {
		const ctx = createFakeStudioContext();
		ctx.emit("x", { p: 1 });
		expect(ctx._mocks.emitCalls).toEqual([["x", { p: 1 }]]);
	});

	it("records registered asset resolvers on _mocks.assetResolvers", () => {
		const ctx = createFakeStudioContext();
		const resolver = () => null;
		ctx.registerAssetResolver(resolver);
		expect(ctx._mocks.assetResolvers).toEqual([resolver]);
	});

	it("records dispatch calls on _mocks.dispatchCalls", () => {
		const ctx = createFakeStudioContext();
		ctx.getPuckApi().dispatch({ type: "setData" } as never);
		expect(ctx._mocks.dispatchCalls[0]).toEqual([{ type: "setData" }]);
	});

	it("honours getData override", () => {
		const ctx = createFakeStudioContext({
			getData: () => ({
				root: { props: {} },
				content: [{ type: "Hero", props: { id: "hero-1" } }],
				zones: {},
			}),
		});
		expect(ctx.getData().content).toHaveLength(1);
	});
});

describe("createFakePageIR", () => {
	it("returns a valid version 1 IR with a hero child by default", () => {
		const ir = createFakePageIR();
		expect(ir.version).toBe("1");
		expect(ir.root.type).toBe("__root__");
		expect(ir.root.children?.[0]?.type).toBe("Hero");
	});

	it("accepts a custom children array", () => {
		const ir = createFakePageIR({
			children: [
				{ id: "s-1", type: "Section", props: { title: "x" } },
			],
		});
		expect(ir.root.children?.[0]?.type).toBe("Section");
	});
});

describe("registerPlugin", () => {
	it("runs onInit and exposes the harness ctx", async () => {
		const plugin: StudioPlugin = {
			meta: {
				id: "fixture.unit",
				name: "Fixture unit",
				version: "1.0.0",
				coreVersion: "^0.1.0-alpha",
			},
			register(_ctx) {
				return {
					meta: plugin.meta,
					hooks: {
						onInit(ctx) {
							ctx.log("info", "init");
						},
					},
				};
			},
		};
		const h = await registerPlugin(plugin);
		await h.runInit();
		expect(h.ctx._mocks.logCalls[0]).toEqual(["info", "init", undefined]);
	});
});
