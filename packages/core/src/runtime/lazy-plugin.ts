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

import type { Config as PuckConfig } from "@puckeditor/core";
import type {
	StudioPlugin,
	StudioPluginContext,
	StudioPluginMeta,
	StudioPluginRegistration,
} from "@/types/plugin";
import { StudioPluginError } from "./errors.js";
import { isCoreVersionCompatible } from "./semver.js";
import { CORE_VERSION } from "./version.js";

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
			// AR-c: `compilePlugins` gates the *declared* `meta`
			// (coreVersion + id uniqueness) up-front, but the loaded
			// module's real meta previously bypassed both gates. Reconcile
			// them so a lazy plugin cannot smuggle in a mismatched id or an
			// incompatible coreVersion. Thrown StudioPluginErrors propagate
			// verbatim through `compilePlugins`' register() catch.
			if (real.meta.id !== meta.id) {
				throw new StudioPluginError(
					meta.id,
					`Lazy plugin meta.id mismatch: declared "${meta.id}" but the loaded module registered "${real.meta.id}". The up-front meta must match the real plugin so the runtime's id-uniqueness and coreVersion gates are not bypassed.`,
				);
			}
			if (!isCoreVersionCompatible(real.meta.coreVersion)) {
				throw new StudioPluginError(
					real.meta.id,
					`Lazy plugin "${real.meta.id}" requires @anvilkit/core "${real.meta.coreVersion}" but the installed version is "${CORE_VERSION}"`,
				);
			}
			return real.register(ctx);
		},
	};
}

/**
 * Pure transform applied to a plugin's {@link StudioPluginRegistration}
 * — e.g. to drop a registration field before the runtime aggregates it.
 *
 * Kept React-free (operates on plain registration data, never on React
 * nodes) so it composes inside the `runtime/` layer and survives the
 * `check:react-free-runtime` gate.
 */
export type RegistrationTransform<UserConfig extends PuckConfig = PuckConfig> =
	(
		registration: StudioPluginRegistration<UserConfig>,
	) => StudioPluginRegistration<UserConfig>;

/**
 * Like {@link lazyPlugin}, but applies `transform` to the loaded
 * plugin's registration **inside the lazy boundary** — after the chunk
 * is fetched at `register()` time, never before.
 *
 * This is the lazy-preserving replacement for host helpers that wrap an
 * **already-instantiated** plugin to tweak its registration (e.g. a
 * "strip header actions" wrapper). Such instance wrappers force the
 * plugin's `import()` to resolve eagerly at module scope, defeating
 * code-splitting. By re-wrapping with {@link lazyPlugin} and deferring
 * `load()`, the chunk stays out of the host's initial bundle until
 * `compilePlugins()` awaits `register()`.
 *
 * The inner loader returns the **loaded module's real `meta`** so
 * {@link lazyPlugin}'s post-fetch id / `coreVersion` re-validation still
 * runs against the genuine module — the transform wraps the
 * `register()` delegation, it does not bypass the gates. The declared
 * `meta` argument is what the up-front id-uniqueness and `coreVersion`
 * checks (and the plugin-array fingerprint) use, all without resolving
 * the dynamic import.
 *
 * @example
 * const assetManager = lazyPluginWith(
 *   () => import("@anvilkit/plugin-asset-manager").then((m) =>
 *     m.createAssetManagerPlugin({ uploader: m.inMemoryUploader() }),
 *   ),
 *   {
 *     id: "@anvilkit/plugin-asset-manager",
 *     name: "Asset Manager",
 *     version: "0.1.0",
 *     coreVersion: "^0.1.0",
 *     capabilities: { header: true },
 *   },
 *   withoutHeaderActions,
 * );
 */
export function lazyPluginWith<UserConfig extends PuckConfig = PuckConfig>(
	load: StudioPluginLoader<UserConfig>,
	meta: StudioPluginMeta,
	transform: RegistrationTransform<UserConfig>,
): StudioPlugin<UserConfig> {
	return lazyPlugin<UserConfig>(async () => {
		const real = await load();
		return {
			meta: real.meta,
			register: async (ctx) => transform(await real.register(ctx)),
		};
	}, meta);
}

/**
 * Ready-made {@link RegistrationTransform} that drops a plugin's
 * `headerActions` from its registration while leaving every other
 * contribution (overrides, sidebar registrations, export formats,
 * providers, overlays, slots) intact.
 *
 * Pair with {@link lazyPluginWith} when a host wants a plugin's sidebar
 * / export surfaces but not its toolbar buttons (e.g. when a custom
 * chrome owns the header) — without forcing the plugin's chunk to load
 * eagerly.
 */
export const withoutHeaderActions: RegistrationTransform = ({
	headerActions: _omit,
	...rest
}) => rest;
