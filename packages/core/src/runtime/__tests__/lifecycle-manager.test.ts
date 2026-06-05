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

import { StudioConfigSchema } from "@/config/schema";
import { StudioPluginError } from "@/runtime/errors";
import { createLifecycleManager } from "@/runtime/lifecycle-manager";
import type {
	StudioPluginContext,
	StudioPluginRegistration,
} from "@/types/plugin";

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
		t: (key) => key,
		registerMessages: () => undefined,
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
			coreVersion: "^0.1.0",
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

	it("does not log in-flight parallel hook rejections after dispose", async () => {
		let rejectHook: ((error: Error) => void) | undefined;
		const lifecycle = createLifecycleManager([
			makeRegistration("slow", {
				onAfterPublish() {
					return new Promise<void>((_resolve, reject) => {
						rejectHook = reject;
					});
				},
			}),
		]);

		const { ctx, log } = makeCtx();
		const emitPromise = lifecycle.emit("onAfterPublish", ctx, {
			root: { props: {} },
			content: [],
			zones: {},
		});

		lifecycle.dispose();
		rejectHook?.(new Error("late failure"));

		await expect(emitPromise).resolves.toBeUndefined();
		expect(log).not.toHaveBeenCalled();
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

describe("createLifecycleManager — onReady", () => {
	it("invokes every plugin's onReady hook in parallel and fires subscribers", async () => {
		const calls: string[] = [];
		const lifecycle = createLifecycleManager([
			makeRegistration("a", {
				async onReady() {
					await Promise.resolve();
					calls.push("a");
				},
			}),
			makeRegistration("b", {
				onReady() {
					calls.push("b");
				},
			}),
		]);
		const subscriber = vi.fn();
		lifecycle.subscribe("onReady", subscriber);

		const { ctx } = makeCtx();
		await lifecycle.emit("onReady", ctx);

		expect(calls.sort()).toEqual(["a", "b"]);
		expect(subscriber).toHaveBeenCalledTimes(1);
	});

	it("a throwing onReady hook is logged but does not abort the others", async () => {
		const ok = vi.fn();
		const lifecycle = createLifecycleManager([
			makeRegistration("bad", {
				onReady() {
					throw new Error("boom");
				},
			}),
			makeRegistration("good", { onReady: ok }),
		]);

		const { ctx, log } = makeCtx();
		await expect(lifecycle.emit("onReady", ctx)).resolves.toBeUndefined();
		expect(ok).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("onReady"),
			expect.objectContaining({ error: expect.any(Error) }),
		);
	});
});

describe("createLifecycleManager — phase machine (A2)", () => {
	const flush = () => new Promise((r) => setTimeout(r, 0));

	it("starts in `compiled` and fires onInit on advanceTo('init')", async () => {
		const order: string[] = [];
		const lifecycle = createLifecycleManager([
			makeRegistration("a", {
				onInit() {
					order.push("onInit");
				},
				onReady() {
					order.push("onReady");
				},
			}),
		]);
		const { ctx } = makeCtx();

		expect(lifecycle.phase()).toBe("compiled");

		lifecycle.advanceTo("init", ctx);
		expect(lifecycle.phase()).toBe("init");
		await flush();
		expect(order).toEqual(["onInit"]);

		lifecycle.advanceTo("ready", ctx);
		await flush();
		expect(order).toEqual(["onInit", "onReady"]);
		expect(lifecycle.phase()).toBe("running");
	});

	it("is order-independent: advanceTo('ready') before 'init' still fires onReady once, after onInit", async () => {
		const order: string[] = [];
		const lifecycle = createLifecycleManager([
			makeRegistration("a", {
				onInit() {
					order.push("onInit");
				},
				onReady() {
					order.push("onReady");
				},
			}),
		]);
		const { ctx } = makeCtx();

		// Binder effect commits before the controller's init effect.
		lifecycle.advanceTo("ready", ctx);
		expect(lifecycle.phase()).toBe("compiled");
		lifecycle.advanceTo("init", ctx);
		await flush();

		expect(order).toEqual(["onInit", "onReady"]);
		expect(lifecycle.phase()).toBe("running");
	});

	it("dedupes: repeated advanceTo('ready') fires onReady exactly once", async () => {
		let readyCount = 0;
		const lifecycle = createLifecycleManager([
			makeRegistration("a", {
				onReady() {
					readyCount += 1;
				},
			}),
		]);
		const { ctx } = makeCtx();

		lifecycle.advanceTo("init", ctx);
		lifecycle.advanceTo("ready", ctx);
		lifecycle.advanceTo("ready", ctx);
		lifecycle.advanceTo("ready", ctx);
		await flush();

		expect(readyCount).toBe(1);
	});

	it("still fires onReady when an onInit hook throws (non-veto, documented A2 decision)", async () => {
		const order: string[] = [];
		const lifecycle = createLifecycleManager([
			makeRegistration("a", {
				onInit() {
					order.push("onInit");
					throw new Error("onInit boom");
				},
				onReady() {
					order.push("onReady");
				},
			}),
		]);
		const { ctx, log } = makeCtx();

		lifecycle.advanceTo("init", ctx);
		lifecycle.advanceTo("ready", ctx);
		await flush();

		// onInit threw → logged (existing swallow), and onReady still
		// fires: onInit is non-veto by contract.
		expect(order).toEqual(["onInit", "onReady"]);
		expect(log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("onInit"),
			expect.objectContaining({ error: expect.anything() }),
		);
	});

	it("does not fire a late onReady after dispose()", async () => {
		let readyCount = 0;
		const lifecycle = createLifecycleManager([
			makeRegistration("a", {
				async onInit() {
					await new Promise((r) => setTimeout(r, 10));
				},
				onReady() {
					readyCount += 1;
				},
			}),
		]);
		const { ctx } = makeCtx();

		lifecycle.advanceTo("init", ctx);
		lifecycle.advanceTo("ready", ctx);
		lifecycle.dispose(); // before onInit's 10ms settle
		expect(lifecycle.phase()).toBe("destroyed");
		await new Promise((r) => setTimeout(r, 25));

		expect(readyCount).toBe(0);
	});

	it("external advanceTo('running') cannot skip onReady (codex-review P2)", async () => {
		let readyCount = 0;
		const lifecycle = createLifecycleManager([
			makeRegistration("a", {
				async onInit() {
					// Async settle opens the window an external
					// `advanceTo("running")` could exploit.
					await new Promise((r) => setTimeout(r, 10));
				},
				onReady() {
					readyCount += 1;
				},
			}),
		]);
		const { ctx } = makeCtx();

		lifecycle.advanceTo("init", ctx);
		lifecycle.advanceTo("ready", ctx);
		// A caller (the public surface accepts "running") tries to jump
		// the phase before onInit settles — must be a no-op, not a
		// way to bypass the onReady continuation.
		lifecycle.advanceTo("running", ctx);
		expect(lifecycle.phase()).toBe("ready");
		await new Promise((r) => setTimeout(r, 25));

		expect(readyCount).toBe(1);
		expect(lifecycle.phase()).toBe("running"); // set by the engine
	});

	it("after advanceTo('destroyed'), emit() blocks all events except onDestroy (codex-review P2)", async () => {
		const seen: string[] = [];
		const lifecycle = createLifecycleManager([
			makeRegistration("a", {
				onDataChange() {
					seen.push("onDataChange");
				},
				onAfterPublish() {
					seen.push("onAfterPublish");
				},
				onDestroy() {
					seen.push("onDestroy");
				},
			}),
		]);
		const { ctx } = makeCtx();
		const data = { root: { props: {} }, content: [], zones: {} };

		lifecycle.advanceTo("destroyed", ctx);
		// Public caller did NOT dispose() — terminal phase must still
		// stop later non-onDestroy emits.
		await lifecycle.emit("onDataChange", ctx, data);
		await lifecycle.emit("onAfterPublish", ctx, data);
		// The shell's own teardown order (destroyed → onDestroy →
		// dispose) must still deliver onDestroy.
		await lifecycle.emit("onDestroy", ctx);

		expect(seen).toEqual(["onDestroy"]);
	});

	it("advanceTo('destroyed') cancels a pending debounced onDataChange (codex-review P2)", async () => {
		let dataChangeCount = 0;
		const lifecycle = createLifecycleManager(
			[
				makeRegistration("a", {
					onDataChange() {
						dataChangeCount += 1;
					},
				}),
			],
			{ onDataChangeDebounceMs: 15 },
		);
		const { ctx } = makeCtx();
		const data = { root: { props: {} }, content: [], zones: {} };

		// Schedule a debounced onDataChange, then go terminal WITHOUT
		// dispose() (public-caller path).
		void lifecycle.emit("onDataChange", ctx, data);
		lifecycle.advanceTo("destroyed", ctx);
		await new Promise((r) => setTimeout(r, 40)); // past the 15ms debounce

		expect(dataChangeCount).toBe(0);
	});

	it("advanceTo is inert after `destroyed`", async () => {
		let initCount = 0;
		const lifecycle = createLifecycleManager([
			makeRegistration("a", {
				onInit() {
					initCount += 1;
				},
			}),
		]);
		const { ctx } = makeCtx();

		lifecycle.advanceTo("destroyed", ctx);
		expect(lifecycle.phase()).toBe("destroyed");
		lifecycle.advanceTo("init", ctx);
		await flush();

		expect(initCount).toBe(0);
		expect(lifecycle.phase()).toBe("destroyed");
	});
});
