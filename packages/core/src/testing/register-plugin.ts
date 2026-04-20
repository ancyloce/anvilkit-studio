import { compilePlugins } from "../runtime/compile-plugins.js";
import type {
	StudioPlugin,
	StudioPluginContext,
	StudioPluginRegistration,
} from "../types/plugin.js";

import type { FakeStudioContext } from "./create-fake-studio-context.js";
import { createFakeStudioContext } from "./create-fake-studio-context.js";

export interface RegisterPluginOptions {
	readonly ctx?: StudioPluginContext;
}

export interface PluginLifecycleHarness {
	readonly ctx: FakeStudioContext;
	readonly registration: StudioPluginRegistration;
	/**
	 * Fire `hooks.onInit` if the plugin registered one. Resolves when
	 * the hook settles — safe to `await` even for sync hooks.
	 */
	readonly runInit: () => Promise<void>;
	/** Fire `hooks.onDestroy` if present. */
	readonly runDestroy: () => Promise<void>;
}

/**
 * Thin plugin-lifecycle harness for tests. Registers the plugin
 * through the **same** `compilePlugins()` path the `<Studio>` shell
 * uses, so a plugin that fails production's compile-time invariants
 * (structural guard, coreVersion range, duplicate meta.id across a
 * multi-plugin test, `register()` rejection) fails the test with the
 * same error the host will see. This closes the gap Codex flagged in
 * the pass-1 review: previously `registerPlugin` called
 * `plugin.register(ctx)` directly and tests could quietly pass
 * against a plugin production would reject.
 *
 * Host-agnostic; no React imports. A fuller RTL-based
 * `renderPluginInHost` helper is tracked as a follow-up.
 */
function isFakeStudioContext(
	ctx: StudioPluginContext | undefined,
): ctx is FakeStudioContext {
	return (
		ctx !== undefined &&
		"_mocks" in ctx &&
		typeof (ctx as FakeStudioContext)._mocks === "object"
	);
}

export async function registerPlugin(
	plugin: StudioPlugin,
	options: RegisterPluginOptions = {},
): Promise<PluginLifecycleHarness> {
	// `harness.ctx` is typed as `FakeStudioContext`, which means
	// callers expect `ctx._mocks` to exist. If a real
	// `StudioPluginContext` slipped through `options.ctx`, the
	// mock-tracking arrays would be undefined at runtime despite
	// the type. Detect that case and wrap with the helpers from
	// `createFakeStudioContext` so spy-backed handlers are used.
	// (codex review, phase4-batch, P2.)
	const ctx: FakeStudioContext = isFakeStudioContext(options.ctx)
		? options.ctx
		: createFakeStudioContext(options.ctx);

	// Route through `compilePlugins` so compile-time invariants
	// (structural shape, coreVersion range, duplicate id detection)
	// are enforced identically to production. `registrations` carries
	// the raw per-plugin registration we hand back to test authors.
	const runtime = await compilePlugins([plugin], ctx);
	const registration = runtime.registrations[0];
	if (registration === undefined) {
		throw new Error(
			`registerPlugin: compilePlugins did not return a registration for "${plugin.meta.id}"`,
		);
	}

	return {
		ctx,
		registration,
		async runInit() {
			await registration.hooks?.onInit?.(ctx);
		},
		async runDestroy() {
			await registration.hooks?.onDestroy?.(ctx);
		},
	};
}
