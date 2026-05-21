/**
 * @file `lazyPlugin()` — wrap a dynamic-import loader as a Studio plugin.
 *
 * Plugins are workspace packages in this monorepo and ship through the
 * host's bundler. By default, importing a plugin at the top of a page
 * pulls its full implementation into that page's chunk regardless of
 * whether the user ever opens the surfaces it contributes.
 *
 * `lazyPlugin(load, meta)` lets the host present a `StudioPlugin` to
 * `<Studio>` whose actual implementation is loaded via a deferred
 * `import()`. The plugin's `meta` is provided up-front so the runtime
 * can validate `coreVersion`, run id-uniqueness checks, and fingerprint
 * the plugin array without paying the import cost. The chunk is only
 * fetched when `compilePlugins()` awaits `register()`.
 *
 * Webpack / Next.js / Vite all treat `() => import("@scope/pkg")` as a
 * split point by default, so each lazy plugin lands in its own chunk
 * without any bundler config.
 */

import type {
	StudioPlugin,
	StudioPluginContext,
	StudioPluginMeta,
	StudioPluginRegistration,
} from "@/types/plugin";
import type { Config as PuckConfig } from "@puckeditor/core";

/**
 * Loader function returning either a plugin module's default export or
 * a named export that is itself a `StudioPlugin`. Most ergonomic shape
 * for callers writing `() => import("@anvilkit/plugin-x").then(m => m.plugin)`.
 */
export type StudioPluginLoader<UserConfig extends PuckConfig = PuckConfig> =
	() => Promise<StudioPlugin<UserConfig>>;

/**
 * Wrap an async plugin loader as a `StudioPlugin` with the supplied
 * synchronous `meta`. The actual plugin module is fetched on first
 * `register()` invocation — i.e. once `<Studio>` mounts and
 * `compilePlugins()` reaches this entry of the `plugins` prop.
 *
 * @example
 * const aiCopilot = lazyPlugin(
 *   () => import("@anvilkit/plugin-ai-copilot").then(m => m.aiCopilotPlugin),
 *   {
 *     id: "@anvilkit/plugin-ai-copilot",
 *     name: "AI Copilot",
 *     version: "0.1.0",
 *     coreVersion: "^0.1.0",
 *     capabilities: { sidebar: true },
 *   },
 * );
 */
export function lazyPlugin<UserConfig extends PuckConfig = PuckConfig>(
	load: StudioPluginLoader<UserConfig>,
	meta: StudioPluginMeta,
): StudioPlugin<UserConfig> {
	return {
		meta,
		async register(
			ctx: StudioPluginContext<UserConfig>,
		): Promise<StudioPluginRegistration<UserConfig>> {
			const real = await load();
			return real.register(ctx);
		},
	};
}
