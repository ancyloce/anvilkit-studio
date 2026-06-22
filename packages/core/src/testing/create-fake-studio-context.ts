import type { PuckApi, Config as PuckConfig } from "@puckeditor/core";

import { StudioConfigSchema } from "@/config/schema";
import { createEventBus } from "@/runtime/event-bus";
import type { IRAssetResolver, StudioPluginContext } from "@/types/plugin";

/**
 * Shape returned by {@link createFakeStudioContext}. Extends the
 * real `StudioPluginContext` with test-only handles on the mock
 * functions so assertions can reach them without
 * `(ctx.log as ReturnType<typeof vi.fn>)` casts.
 */
export interface FakeStudioContext<UserConfig extends PuckConfig = PuckConfig>
	extends StudioPluginContext<UserConfig> {
	readonly _mocks: {
		/** All `ctx.log()` calls in order. */
		readonly logCalls: Array<
			readonly [
				Parameters<StudioPluginContext["log"]>[0],
				Parameters<StudioPluginContext["log"]>[1],
				Parameters<StudioPluginContext["log"]>[2],
			]
		>;
		/** All `ctx.emit()` calls in order. */
		readonly emitCalls: Array<readonly [string, unknown]>;
		/** All asset resolvers registered through `ctx.registerAssetResolver()`. */
		readonly assetResolvers: IRAssetResolver[];
		/** The dispatch mock attached to the fake `getPuckApi()`. */
		readonly dispatchCalls: unknown[][];
	};
}

export interface FakeStudioContextOverrides<
	UserConfig extends PuckConfig = PuckConfig,
> {
	readonly getData?: StudioPluginContext<UserConfig>["getData"];
	readonly getPuckApi?: StudioPluginContext<UserConfig>["getPuckApi"];
	readonly studioConfig?: StudioPluginContext<UserConfig>["studioConfig"];
	readonly log?: StudioPluginContext<UserConfig>["log"];
	readonly emit?: StudioPluginContext<UserConfig>["emit"];
	readonly on?: StudioPluginContext<UserConfig>["on"];
	readonly t?: StudioPluginContext<UserConfig>["t"];
	readonly registerMessages?: StudioPluginContext<UserConfig>["registerMessages"];
	readonly registerAssetResolver?: StudioPluginContext<UserConfig>["registerAssetResolver"];
	readonly getAssetResolvers?: StudioPluginContext<UserConfig>["getAssetResolvers"];
}

/**
 * Return a fully-typed `StudioPluginContext` with spy-backed
 * `log` / `emit` / `getPuckApi().dispatch` and a working `emit`/`on`
 * event bus (events emitted reach handlers subscribed via `on`).
 * Override any field via
 * the `overrides` argument; fields you don't override use sensible
 * test defaults (empty `Data`, default `StudioConfigSchema.parse({})`,
 * etc).
 *
 * @example
 * ```ts
 * import { createFakeStudioContext } from "@anvilkit/core/testing";
 *
 * const ctx = createFakeStudioContext();
 * await plugin.register(ctx);
 * expect(ctx._mocks.logCalls).toHaveLength(1);
 * ```
 */
export function createFakeStudioContext<
	UserConfig extends PuckConfig = PuckConfig,
>(
	overrides: FakeStudioContextOverrides<UserConfig> = {},
): FakeStudioContext<UserConfig> {
	const logCalls: FakeStudioContext<UserConfig>["_mocks"]["logCalls"] = [];
	const emitCalls: FakeStudioContext<UserConfig>["_mocks"]["emitCalls"] = [];
	const assetResolvers: FakeStudioContext<UserConfig>["_mocks"]["assetResolvers"] =
		[];
	const dispatchCalls: FakeStudioContext<UserConfig>["_mocks"]["dispatchCalls"] =
		[];

	// A real in-process bus so plugins that subscribe with `ctx.on` and
	// emit with `ctx.emit` actually exchange events under test, while
	// `emitCalls` still records every emit for assertions.
	const eventBus = createEventBus();

	const defaultPuckApi = {
		dispatch: (...args: unknown[]) => {
			dispatchCalls.push(args);
		},
	} as unknown as PuckApi<UserConfig>;

	return {
		getData:
			overrides.getData ??
			(() => ({ root: { props: {} }, content: [], zones: {} })),
		getPuckApi: overrides.getPuckApi ?? (() => defaultPuckApi),
		studioConfig: overrides.studioConfig ?? StudioConfigSchema.parse({}),
		log:
			overrides.log ??
			((level, message, meta) => {
				logCalls.push([level, message, meta]);
			}),
		emit:
			overrides.emit ??
			((event, payload) => {
				emitCalls.push([event, payload]);
				eventBus.emit(event, payload);
			}),
		on: overrides.on ?? ((event, handler) => eventBus.on(event, handler)),
		// Default fake resolver: returns the key (or the supplied fallback
		// is irrelevant here) so assertions that only need a string pass;
		// override `t` for tests that pin specific resolutions.
		t: overrides.t ?? ((key) => key),
		registerMessages: overrides.registerMessages ?? (() => undefined),
		registerAssetResolver:
			overrides.registerAssetResolver ??
			((resolver) => {
				assetResolvers.push(resolver);
			}),
		getAssetResolvers: overrides.getAssetResolvers ?? (() => assetResolvers),
		_mocks: { logCalls, emitCalls, assetResolvers, dispatchCalls },
	};
}
