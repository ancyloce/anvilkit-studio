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
 * Internal marker stamped on a {@link StudioPluginMeta} that
 * {@link lazyPluginWith} *synthesized* because the caller used the
 * two-argument `lazyPluginWith(load, transform)` form and did not
 * supply a `meta`. Read only inside this module.
 *
 * Why a placeholder is even needed: a plugin's real `meta` lives inside
 * its lazily-imported chunk, so it cannot be the **synchronous** `meta`
 * the runtime reads *before* that chunk is fetched — the id-uniqueness
 * and `coreVersion` gates in `compilePlugins`, the plugin-array
 * fingerprint in `<Studio>`, and the progressive-chrome reads of
 * `meta.capabilities` / `meta.staticHeaderActions`. When the caller
 * omits `meta` we stand in this minimal placeholder for those up-front
 * steps and recover the genuine values post-fetch: {@link lazyPlugin}
 * enforces the **real** module's `coreVersion` in `register()` exactly
 * as it does for a declared meta. The marker tells `lazyPlugin` to skip
 * the declared-vs-real *id* equality check, which is meaningless against
 * a synthesized id.
 *
 * Trade-offs the caller accepts by omitting `meta` (all because the real
 * values are unknown until the chunk loads):
 * - `runtime.pluginMeta` exposes the placeholder id/name for this plugin
 *   (a diagnostic-only surface) until — and the real id never replaces
 *   it, to keep the fingerprint stable across renders).
 * - `meta.capabilities` / `meta.staticHeaderActions` are absent up-front,
 *   so the chrome cannot reserve this plugin's header slot before its
 *   chunk loads. Fine for a plugin whose header actions are stripped
 *   (e.g. paired with {@link withoutHeaderActions}) or that contributes
 *   no toolbar surface; declare `meta` explicitly when you need the slot
 *   reserved pre-fetch.
 * - Two auto-meta wrappers of the *same* package are not detected as
 *   duplicate ids up-front (each gets a distinct placeholder id); the
 *   real `coreVersion` is still enforced for both, post-fetch.
 */
const AUTO_META: unique symbol = Symbol("anvilkit.core.lazyPlugin.autoMeta");

/**
 * Monotonic counter giving every synthesized placeholder a
 * process-unique id, so the runtime's id-uniqueness registry accepts
 * each auto-meta lazy plugin up-front. Module-scope (not per render) so
 * the ids are stable for a given construction order.
 */
let autoMetaSerial = 0;

/**
 * Build the synchronous placeholder {@link StudioPluginMeta} used when a
 * caller omits `meta`. `coreVersion` is pinned to the *installed*
 * {@link CORE_VERSION} so the up-front `compilePlugins` gate passes
 * unconditionally — the real module's `coreVersion` is the one actually
 * enforced, post-fetch, in {@link lazyPlugin}.
 */
function createAutoMeta(): StudioPluginMeta {
	autoMetaSerial += 1;
	const meta: StudioPluginMeta & { [AUTO_META]?: true } = {
		id: `anvilkit:lazy-plugin#${autoMetaSerial}`,
		name: "Lazy plugin (meta loads with the chunk)",
		version: "0.0.0",
		coreVersion: CORE_VERSION,
	};
	meta[AUTO_META] = true;
	return meta;
}

/** True for a placeholder produced by {@link createAutoMeta}. */
function isAutoMeta(meta: StudioPluginMeta): boolean {
	return (meta as { [AUTO_META]?: true })[AUTO_META] === true;
}

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
			//
			// When `meta` was synthesized (the two-arg `lazyPluginWith`
			// form — see {@link AUTO_META}), the declared id is an internal
			// placeholder, so a declared-vs-real id check is meaningless and
			// is skipped. The `coreVersion` gate below still runs against the
			// *real* module, so the genuine compatibility check is preserved.
			if (!isAutoMeta(meta) && real.meta.id !== meta.id) {
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
 * `register()` delegation, it does not bypass the gates.
 *
 * ### Two forms
 *
 * - **`lazyPluginWith(load, transform)`** — the ergonomic form: `meta`
 *   is **synthesized automatically** ({@link createAutoMeta}) and the
 *   loaded module's real `meta` becomes the source of truth post-fetch.
 *   Use this when the host has nothing meaningful to declare up-front —
 *   e.g. a plugin paired with {@link withoutHeaderActions}, whose
 *   `capabilities` / header slot do not need to be reserved before the
 *   chunk loads. See {@link AUTO_META} for the trade-offs (placeholder
 *   `runtime.pluginMeta` id; no pre-fetch `capabilities` for this
 *   plugin). The real module's `coreVersion` is still enforced.
 * - **`lazyPluginWith(load, meta, transform)`** — the explicit form:
 *   the declared `meta` is what the up-front id-uniqueness and
 *   `coreVersion` checks (and the plugin-array fingerprint, and the
 *   progressive-chrome `capabilities` / `staticHeaderActions` reads) use,
 *   all without resolving the dynamic import. Declare `meta` when you
 *   need any of those reserved before the chunk is fetched.
 *
 * @example
 * // Auto-meta — id/coreVersion/capabilities come from the chunk:
 * const assetManager = lazyPluginWith(
 *   () => import("@anvilkit/plugin-asset-manager").then((m) =>
 *     m.createAssetManagerPlugin({ uploader: m.inMemoryUploader() }),
 *   ),
 *   withoutHeaderActions,
 * );
 *
 * @example
 * // Explicit meta — reserves the header slot before the chunk loads:
 * const versionHistory = lazyPluginWith(
 *   () => import("@anvilkit/plugin-version-history").then((m) => m.plugin),
 *   { id: "@anvilkit/plugin-version-history", name: "Version History",
 *     version: "0.1.0", coreVersion: "^0.1.0", capabilities: { header: true } },
 *   withoutHeaderActions,
 * );
 */
export function lazyPluginWith<UserConfig extends PuckConfig = PuckConfig>(
	load: StudioPluginLoader<UserConfig>,
	transform: RegistrationTransform<UserConfig>,
): StudioPlugin<UserConfig>;
export function lazyPluginWith<UserConfig extends PuckConfig = PuckConfig>(
	load: StudioPluginLoader<UserConfig>,
	meta: StudioPluginMeta,
	transform: RegistrationTransform<UserConfig>,
): StudioPlugin<UserConfig>;
export function lazyPluginWith<UserConfig extends PuckConfig = PuckConfig>(
	load: StudioPluginLoader<UserConfig>,
	metaOrTransform: StudioPluginMeta | RegistrationTransform<UserConfig>,
	maybeTransform?: RegistrationTransform<UserConfig>,
): StudioPlugin<UserConfig> {
	let meta: StudioPluginMeta;
	let transform: RegistrationTransform<UserConfig>;
	if (typeof metaOrTransform === "function") {
		// `lazyPluginWith(load, transform)` — synthesize the meta; the real
		// values are recovered from the loaded module (see {@link AUTO_META}).
		meta = createAutoMeta();
		transform = metaOrTransform;
	} else {
		// `lazyPluginWith(load, meta, transform)` — explicit meta. The
		// transform is required in this form; guard JS callers that omit it.
		if (maybeTransform === undefined) {
			throw new TypeError(
				"lazyPluginWith(load, meta, transform): the transform argument is required. Use lazyPlugin(load, meta) for a lazy plugin without a registration transform.",
			);
		}
		meta = metaOrTransform;
		transform = maybeTransform;
	}
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
