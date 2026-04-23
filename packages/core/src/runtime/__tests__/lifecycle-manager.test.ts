/**
 * @file Runtime tests for `createLifecycleManager`.
 *
 * Covers:
 * - `onBeforePublish` runs sequentially and aborts on the first
 *   throw (rethrowing a `StudioPluginError`).
 * - `onDataChange` / `onAfterPublish` errors are routed through
 *   `ctx.log("error", …)` and do not abort.
 * - `subscribe` returns a working unsubscribe handle.
 * - Subscribers fire after plugin hooks have settled.
 */

import { describe, expect, it, vi } from "vitest";

import { StudioConfigSchema } from "../../config/schema.js";
import type {
	StudioPluginContext,
	StudioPluginRegistration,
} from "../../types/plugin.js";
import { StudioPluginError } from "../errors.js";
import { createLifecycleManager } from "../lifecycle-manager.js";

const studioConfig = StudioConfigSchema.parse({});

/**
 * Build a minimal `StudioPluginContext` test double. Every method
 * that the lifecycle manager touches is a spy so individual tests
 * can make assertions about logging behavior.
 */
function makeCtx() {
	const log = vi.fn();
	const emit = vi.fn();
	const getData = vi.fn(() => ({
		root: { props: {} },
		content: [],
		zones: {},
	}));
	const getPuckApi = vi.fn(() => {
		throw new Error("getPuckApi should not be invoked in these tests");
	});

	const ctx: StudioPluginContext = {
		getData,
		getPuckApi: getPuckApi as unknown as StudioPluginContext["getPuckApi"],
		studioConfig,
		log,
		emit,
		registerAssetResolver: vi.fn(),
	};

	return { ctx, log, emit };
}

function makeRegistration(
	id: string,
	hooks: StudioPluginRegistration["hooks"] = {},
): StudioPluginRegistration {
	return {
		meta: {
			id,
			name: id,
			version: "1.0.0",
			coreVersion: "^0.1.0-alpha",
		},
		hooks,
	};
}

describe("createLifecycleManager — onBeforePublish", () => {
	it("runs plugins sequentially in declaration order", async () => {
		const calls: string[] = [];
		const lifecycle = createLifecycleManager([
			makeRegistration("a", {
				async onBeforePublish() {
					await Promise.resolve();
					calls.push("a");
				},
			}),
			makeRegistration("b", {
				onBeforePublish() {
					calls.push("b");
				},
			}),
		]);

		const { ctx } = makeCtx();
		await lifecycle.emit("onBeforePublish", ctx, {
			root: { props: {} },
			content: [],
			zones: {},
		});

		expect(calls).toEqual(["a", "b"]);
	});

	it("aborts the rest of the chain on the first throw", async () => {
		const calls: string[] = [];
		const lifecycle = createLifecycleManager([
			makeRegistration("a", {
				onBeforePublish() {
					calls.push("a");
					throw new StudioPluginError("a", "veto");
				},
			}),
			makeRegistration("b", {
				onBeforePublish() {
					calls.push("b");
				},
			}),
		]);

		const { ctx } = makeCtx();

		await expect(
			lifecycle.emit("onBeforePublish", ctx, {
				root: { props: {} },
				content: [],
				zones: {},
			}),
		).rejects.toBeInstanceOf(StudioPluginError);
		expect(calls).toEqual(["a"]);
	});

	it("wraps non-Studio errors in StudioPluginError with the offending plugin id", async () => {
		const lifecycle = createLifecycleManager([
			makeRegistration("a", {
				onBeforePublish() {
					throw new Error("raw");
				},
			}),
		]);

		const { ctx } = makeCtx();

		await lifecycle
			.emit("onBeforePublish", ctx, {
				root: { props: {} },
				content: [],
				zones: {},
			})
			.then(
				() => {
					throw new Error("expected emit to reject");
				},
				(error: unknown) => {
					expect(error).toBeInstanceOf(StudioPluginError);
					if (error instanceof StudioPluginError) {
						expect(error.pluginId).toBe("a");
						expect(error.cause).toBeInstanceOf(Error);
					}
				},
			);
	});
});

describe("createLifecycleManager — onDataChange / onAfterPublish", () => {
	it("onDataChange errors are logged via ctx.log but do not abort", async () => {
		const otherRan = vi.fn();
		const lifecycle = createLifecycleManager([
			makeRegistration("broken", {
				onDataChange() {
					throw new Error("broken plugin");
				},
			}),
			makeRegistration("fine", {
				onDataChange() {
					otherRan();
				},
			}),
		]);

		const { ctx, log } = makeCtx();
		await lifecycle.emit("onDataChange", ctx, {
			root: { props: {} },
			content: [],
			zones: {},
		});

		expect(otherRan).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("broken"),
			expect.objectContaining({ error: expect.any(Error) }),
		);
	});

	it("onAfterPublish errors are logged but do not abort", async () => {
		const otherRan = vi.fn();
		const lifecycle = createLifecycleManager([
			makeRegistration("broken", {
				async onAfterPublish() {
					throw new Error("async boom");
				},
			}),
			makeRegistration("fine", {
				onAfterPublish() {
					otherRan();
				},
			}),
		]);

		const { ctx, log } = makeCtx();
		await lifecycle.emit("onAfterPublish", ctx, {
			root: { props: {} },
			content: [],
			zones: {},
		});

		expect(otherRan).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("onAfterPublish"),
			expect.objectContaining({ error: expect.any(Error) }),
		);
	});
});

describe("createLifecycleManager — subscribe", () => {
	it("fires subscribers after plugin hooks settle", async () => {
		const order: string[] = [];
		const lifecycle = createLifecycleManager([
			makeRegistration("a", {
				async onInit() {
					await Promise.resolve();
					order.push("plugin");
				},
			}),
		]);

		lifecycle.subscribe("onInit", () => {
			order.push("subscriber");
		});

		const { ctx } = makeCtx();
		await lifecycle.emit("onInit", ctx);

		expect(order).toEqual(["plugin", "subscriber"]);
	});

	it("unsubscribe removes the handler", async () => {
		const lifecycle = createLifecycleManager([]);
		const handler = vi.fn();
		const off = lifecycle.subscribe("onDataChange", handler);

		const { ctx } = makeCtx();
		await lifecycle.emit("onDataChange", ctx, {
			root: { props: {} },
			content: [],
			zones: {},
		});
		expect(handler).toHaveBeenCalledTimes(1);

		off();
		await lifecycle.emit("onDataChange", ctx, {
			root: { props: {} },
			content: [],
			zones: {},
		});
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("subscribers that throw do not crash emit or other subscribers", async () => {
		const lifecycle = createLifecycleManager([]);
		const other = vi.fn();
		lifecycle.subscribe("onDestroy", () => {
			throw new Error("bad subscriber");
		});
		lifecycle.subscribe("onDestroy", other);

		const { ctx, log } = makeCtx();
		await expect(lifecycle.emit("onDestroy", ctx)).resolves.toBeUndefined();
		expect(other).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("subscriber"),
			expect.objectContaining({ error: expect.any(Error) }),
		);
	});
});
