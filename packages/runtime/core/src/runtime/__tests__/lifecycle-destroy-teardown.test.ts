/**
 * @file Regression tests for review 0036 M-5 — `onDestroy` must still
 * report, even though disposal is racing it.
 *
 * The shell tears a runtime down with three synchronous statements:
 *
 * ```ts
 * runtime.lifecycle.advanceTo("destroyed", ctx);
 * void runtime.lifecycle.emit("onDestroy", ctx);   // async
 * runtime.lifecycle.dispose();                     // wins the race
 * ```
 *
 * `emit` invokes the hooks synchronously, so they DO run — but it then
 * awaits `Promise.allSettled`, and by the time that resolves `dispose()`
 * has already set `disposed` and cleared every subscriber set. The
 * post-await `if (disposed) return` therefore skipped both the
 * error-logging loop and `fireSubscribers`, on every single unmount:
 * a plugin whose `onDestroy` rejected was swallowed with no log —
 * contradicting the manager's own documented error contract — and no
 * `onDestroy` observer ever fired.
 *
 * These tests reproduce the exact teardown ordering rather than a
 * tidied-up version of it, because the ordering IS the bug.
 */

import { describe, expect, it, vi } from "vitest";

import { StudioConfigSchema } from "@/config/schema";
import { createLifecycleManager } from "@/runtime/lifecycle-manager";
import type {
	StudioPluginContext,
	StudioPluginRegistration,
} from "@/types/plugin";

const studioConfig = StudioConfigSchema.parse({});

function makeCtx() {
	const log = vi.fn();
	const ctx: StudioPluginContext = {
		getData: () => ({ root: { props: {} }, content: [], zones: {} }),
		getPuckApi: (() => {
			throw new Error("not used");
		}) as unknown as StudioPluginContext["getPuckApi"],
		studioConfig,
		log,
		emit: vi.fn(),
		on: () => () => undefined,
		t: (key) => key,
		registerMessages: () => undefined,
		registerAssetResolver: vi.fn(),
	};
	return { ctx, log };
}

function makeRegistration(
	id: string,
	hooks: StudioPluginRegistration["hooks"] = {},
): StudioPluginRegistration {
	return {
		meta: { id, name: id, version: "1.0.0", coreVersion: "^0.1.0" },
		hooks,
	};
}

/** The shell's teardown, verbatim: emit, then dispose, synchronously. */
function tearDown(
	lifecycle: ReturnType<typeof createLifecycleManager>,
	ctx: StudioPluginContext,
): Promise<void> {
	lifecycle.advanceTo("destroyed", ctx);
	const settled = lifecycle.emit("onDestroy", ctx);
	lifecycle.dispose();
	return settled;
}

describe("onDestroy survives the dispose that races it (0036 M-5)", () => {
	it("logs a rejecting onDestroy hook", async () => {
		const { ctx, log } = makeCtx();
		const boom = new Error("teardown failed");
		const lifecycle = createLifecycleManager([
			makeRegistration("com.test.bad", {
				onDestroy: async () => {
					await Promise.resolve();
					throw boom;
				},
			}),
		]);

		await tearDown(lifecycle, ctx);

		// Before the fix this never ran: `dispose()` had already flipped
		// `disposed`, so the post-await guard returned before the log.
		expect(log).toHaveBeenCalledWith(
			"error",
			'Plugin "com.test.bad" threw during onDestroy',
			expect.objectContaining({ error: boom }),
		);
	});

	it("notifies onDestroy subscribers", async () => {
		const { ctx } = makeCtx();
		const observer = vi.fn();
		const lifecycle = createLifecycleManager([
			makeRegistration("com.test.ok", { onDestroy: () => undefined }),
		]);
		lifecycle.subscribe("onDestroy", observer);

		await tearDown(lifecycle, ctx);

		// `dispose()` clears the subscriber sets, so this needed the
		// snapshot taken before the await.
		expect(observer).toHaveBeenCalledTimes(1);
	});

	it("still runs every hook when one of them rejects", async () => {
		const { ctx } = makeCtx();
		const after = vi.fn();
		const lifecycle = createLifecycleManager([
			makeRegistration("com.test.bad", {
				onDestroy: () => Promise.reject(new Error("nope")),
			}),
			makeRegistration("com.test.good", { onDestroy: after }),
		]);

		await tearDown(lifecycle, ctx);
		expect(after).toHaveBeenCalledTimes(1);
	});

	it("keeps every OTHER event quiet once disposed", async () => {
		// The exemption is scoped to `onDestroy`. A late `onAfterPublish`
		// resolving after teardown must still stay silent.
		const { ctx } = makeCtx();
		const observer = vi.fn();
		const lifecycle = createLifecycleManager([
			makeRegistration("com.test.slow", {
				onAfterPublish: async () => {
					await Promise.resolve();
				},
			}),
		]);
		lifecycle.subscribe("onAfterPublish", observer);

		const settled = lifecycle.emit("onAfterPublish", ctx);
		lifecycle.dispose();
		await settled;

		expect(observer).not.toHaveBeenCalled();
	});
});
