/**
 * @file The Studio plugin contract — the frozen public promise
 * `@anvilkit/core` makes to plugin authors for the `0.1.x` alpha line.
 *
 * ### Design rules
 *
 * 1. **Zero React dependency.** Every Puck type below is imported via
 *    `import type` and erased at compile time. With
 *    `verbatimModuleSyntax: true` in the tsconfig, the emitted `.js`
 *    file contains no reference to `@puckeditor/core` or React — this
 *    file ships as pure type information.
 *
 * 2. **No direct store access.** Plugins read state through
 *    {@link StudioPluginContext} and write state through
 *    `ctx.getPuckApi().dispatch({ type: "setData", data })`. This is a
 *    hard boundary: two plugins must not be able to fight over the
 *    same store slot, and every mutation must flow through Puck so
 *    history is preserved. See architecture §12 (state ownership).
 *
 * 3. **Frozen types.** Shape changes to any symbol in this file require
 *    a Core major bump (or, during alpha, a new `0.1.0-alpha.N`
 *    release). `StudioPluginMeta.coreVersion` lets plugins opt in to a
 *    specific range.
 */

import type {
	Config as PuckConfig,
	Data as PuckData,
	Overrides as PuckOverrides,
	PuckApi,
} from "@puckeditor/core";

import type { StudioConfig } from "./config.js";
import type { ExportFormatDefinition } from "./export.js";

/**
 * Severity level for {@link StudioPluginContext.log}.
 *
 * Follows the conventional `debug` < `info` < `warn` < `error`
 * ordering. The runtime may route different levels to different sinks
 * (e.g. `error` to a host-provided error reporter).
 */
export type StudioLogLevel = "debug" | "info" | "warn" | "error";

/**
 * Identifying metadata every Studio plugin must declare.
 *
 * Authored once per plugin and carried on the `StudioPlugin` object.
 * The runtime consumes this block for both diagnostics and
 * {@link StudioPluginMeta.coreVersion} compatibility checks at
 * `compilePlugins()` time.
 */
export interface StudioPluginMeta {
	/**
	 * Stable, globally-unique plugin identifier.
	 *
	 * Convention: reverse-dns or namespaced slug, e.g.
	 * `"@anvilkit/plugin-export-html"` or `"com.example.ai-copilot"`.
	 * The runtime rejects duplicate ids during `compilePlugins()`.
	 */
	readonly id: string;

	/**
	 * Human-readable display name for the plugin.
	 *
	 * Surfaced in logs, error messages, and (optionally) in the Studio
	 * UI's plugin list.
	 */
	readonly name: string;

	/**
	 * The plugin's own semver version (e.g. `"1.2.3"`).
	 *
	 * Distinct from {@link coreVersion}. Used for diagnostics only —
	 * the runtime does not gate behavior on this field.
	 */
	readonly version: string;

	/**
	 * Semver range of `@anvilkit/core` this plugin targets
	 * (e.g. `"^0.1.0-alpha"`).
	 *
	 * `compilePlugins()` validates this against the installed Core
	 * version. A mismatch throws `StudioPluginError` at compile time
	 * so host apps fail loud rather than rendering with a misaligned
	 * plugin.
	 */
	readonly coreVersion: string;

	/**
	 * Optional one-line description of what the plugin does.
	 */
	readonly description?: string;
}

/**
 * Read / write / observe handle passed to every plugin lifecycle call.
 *
 * ### Read access
 *
 * - {@link getData} returns a snapshot of the current Puck page data.
 *   Cheap to call; no subscription is created.
 * - {@link studioConfig} is the frozen, merged Studio configuration.
 *
 * ### Write access
 *
 * - All mutations go through `getPuckApi().dispatch({ type: "setData",
 *   data })` per architecture §12. Plugins have **no** direct Zustand
 *   store access — that boundary prevents two plugins from fighting
 *   over the same store key and ensures every mutation is captured in
 *   Puck's history stack.
 *
 * ### Observability
 *
 * - {@link log} routes to Core's logger.
 * - {@link emit} broadcasts to the plugin event bus so other plugins
 *   can observe this one (subscribers wire up their own listeners in
 *   `onInit` — Core does not prescribe a subscription API).
 *
 * @typeParam UserConfig - Optional Puck config generic so plugins can
 * receive fully-typed component data. Defaults to the Puck default.
 */
export interface StudioPluginContext<
	UserConfig extends PuckConfig = PuckConfig,
> {
	/**
	 * Return a snapshot of the current Puck page data.
	 *
	 * Calling this does not subscribe the plugin to future changes —
	 * use the {@link StudioPluginLifecycleHooks.onDataChange} hook to
	 * react to data updates.
	 */
	readonly getData: () => PuckData;

	/**
	 * Return the live Puck API for dispatching actions.
	 *
	 * Use `getPuckApi().dispatch({ type: "setData", data })` to mutate
	 * page data. Other dispatch actions (`move`, `insert`, `remove`,
	 * `replace`, …) are also available — see the `@puckeditor/core`
	 * `PuckAction` union for the full list.
	 */
	readonly getPuckApi: () => PuckApi<UserConfig>;

	/**
	 * The frozen, merged Studio configuration for the current session.
	 *
	 * Produced by `createStudioConfig()` (`core-011`) after layering
	 * defaults, environment variables, and host overrides. Plugins must
	 * treat this as deeply read-only — mutating it has no effect on
	 * the runtime and may throw in strict mode.
	 */
	readonly studioConfig: StudioConfig;

	/**
	 * Emit a structured log record at the given severity level.
	 *
	 * @param level - Severity; see {@link StudioLogLevel}.
	 * @param message - Human-readable summary.
	 * @param meta - Optional structured context (forwarded verbatim to
	 * the sink).
	 */
	readonly log: (
		level: StudioLogLevel,
		message: string,
		meta?: Readonly<Record<string, unknown>>,
	) => void;

	/**
	 * Broadcast an event to the Studio plugin event bus.
	 *
	 * Event names are free-form strings — Core does not enforce a
	 * schema. Subscribers validate payloads themselves.
	 *
	 * @param event - Event name (plugin-defined).
	 * @param payload - Optional payload. Defaults to `undefined`.
	 */
	readonly emit: (event: string, payload?: unknown) => void;
}

/**
 * Header action descriptor, contributed by plugins via
 * {@link StudioPluginRegistration.headerActions}.
 *
 * Plugins author header actions as **plain data** — no React, no
 * components, no closures over render-time state. The Studio shell
 * (`core-014`) is responsible for resolving the {@link icon} string
 * to a `lucide-react` icon element, rendering the {@link label}, and
 * wiring up `onClick` / `disabled` to the live React tree at runtime.
 *
 * Keeping the type free of `ReactNode` / `ComponentType` lets the
 * `runtime/` layer stay React-free (architecture §17) and lets test
 * code compare action arrays with structural equality.
 *
 * The full shape was finalized in `core-009` alongside
 * `composeHeaderActions()`. The interface lives in `src/types/` so
 * `StudioPluginRegistration` can reference it without crossing the
 * types → runtime boundary; `composeHeaderActions()` re-exports it
 * for callers that import from `@anvilkit/core/runtime`.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-009-runtime-export-header.md | core-009}
 */
export interface StudioHeaderAction {
	/**
	 * Stable, globally-unique identifier for the action
	 * (e.g. `"export-html"`, `"publish"`). `composeHeaderActions()`
	 * rejects duplicate ids across all contributing plugins.
	 *
	 * Convention: lowercase, hyphen-separated, no namespace prefix —
	 * the runtime treats ids as opaque strings.
	 */
	readonly id: string;

	/**
	 * Human-readable label rendered inside the button (or shown in
	 * the overflow menu) by the Studio shell.
	 *
	 * Required so plugin authors cannot ship a button with no visible
	 * affordance. Localization is the host app's responsibility — the
	 * runtime treats this as an opaque display string.
	 */
	readonly label: string;

	/**
	 * Optional `lucide-react` icon **name** (e.g. `"download"`,
	 * `"sparkles"`). Resolved to a real icon component at render time
	 * by the Studio shell.
	 *
	 * **Why a string and not a `ComponentType`?** The `runtime/` layer
	 * cannot import React, and plugin-contributed action arrays must
	 * stay serializable enough that lifecycle tests can compare them
	 * with `toEqual`. The string-name indirection lets the renderer
	 * own React while the protocol stays headless.
	 */
	readonly icon?: string;

	/**
	 * Display group the action belongs to. Used by
	 * `composeHeaderActions()` as the primary sort key.
	 *
	 * - `"primary"` — high-emphasis call-to-action (e.g. "Publish").
	 * - `"secondary"` — normal toolbar action (e.g. "Save Draft").
	 *   **Default** when omitted — most actions belong here.
	 * - `"overflow"` — collapsed into the "…" menu when space is
	 *   tight (e.g. "Generate with AI", "Download HTML").
	 */
	readonly group?: "primary" | "secondary" | "overflow";

	/**
	 * Per-group ordering hint. Lower values render first; the default
	 * is `100` so plugin authors can interleave their actions with
	 * built-ins (which conventionally use round numbers like `0`,
	 * `100`, `200`).
	 *
	 * Within a group, actions are sorted ascending by `order`. Ties
	 * break on {@link id} for determinism.
	 */
	readonly order?: number;

	/**
	 * Click handler invoked by the Studio shell when the user
	 * activates the action. Receives the same
	 * {@link StudioPluginContext} the lifecycle hooks receive, so
	 * the action can read live page data, call
	 * `getPuckApi().dispatch()`, log diagnostics, or `emit` events
	 * to other plugins.
	 *
	 * The runtime awaits the returned promise (if any) before
	 * re-enabling the button — host apps are free to render a
	 * loading affordance during the wait.
	 *
	 * Errors thrown from `onClick` are caught by the shell and routed
	 * through `ctx.log("error", …)`; they do not crash the editor.
	 */
	readonly onClick: (ctx: StudioPluginContext) => void | Promise<void>;

	/**
	 * Optional predicate that disables the action based on live
	 * context. Called on every render of the header (cheap by
	 * convention — do not perform async work or expensive
	 * computation here).
	 *
	 * Receives the same {@link StudioPluginContext} as `onClick`.
	 * Return `true` to disable the button, `false` (or omit) to
	 * enable it.
	 */
	readonly disabled?: (ctx: StudioPluginContext) => boolean;
}

/**
 * Optional lifecycle method bag returned by a plugin's `register()`.
 *
 * Every hook is optional. The lifecycle manager (`core-008`) awaits
 * async hooks before proceeding, so any hook may return either a
 * synchronous `void` or a `Promise<void>`.
 *
 * ### Ordering
 *
 * Hooks fire in plugin registration order, which mirrors the order of
 * the host app's `createStudioConfig({ plugins: [...] })` array.
 *
 * ### Error handling
 *
 * - {@link onBeforePublish} may throw `StudioPluginError` to abort the
 *   publish. The host receives the error and can surface it.
 * - All other hooks' errors are logged and swallowed — a buggy plugin
 *   must not crash the editor.
 *
 * ### Statelessness
 *
 * Hooks receive a fresh {@link StudioPluginContext} pointer at every
 * call site, so plugins can stay stateless and read the current data
 * / config at the moment the hook fires.
 *
 * @typeParam UserConfig - Optional Puck config generic; mirrors the
 * one on {@link StudioPluginContext} and defaults to Puck's default.
 */
export interface StudioPluginLifecycleHooks<
	UserConfig extends PuckConfig = PuckConfig,
> {
	/**
	 * Fires exactly once, after `compilePlugins()` succeeds and before
	 * `<Studio>` mounts the Puck editor. Use for one-time setup
	 * (subscribing to external data, priming caches, etc.).
	 */
	readonly onInit?: (
		ctx: StudioPluginContext<UserConfig>,
	) => void | Promise<void>;

	/**
	 * Fires on every Puck `onChange` with the fresh data snapshot.
	 *
	 * The `data` argument is passed directly so the plugin does not
	 * need to re-read it from `ctx.getData()`.
	 */
	readonly onDataChange?: (
		ctx: StudioPluginContext<UserConfig>,
		data: PuckData,
	) => void | Promise<void>;

	/**
	 * Fires before the host app publishes. May throw
	 * `StudioPluginError` to abort the publish (e.g. validation
	 * failure, missing required fields).
	 */
	readonly onBeforePublish?: (
		ctx: StudioPluginContext<UserConfig>,
		data: PuckData,
	) => void | Promise<void>;

	/**
	 * Fires after the host app successfully publishes. Use for
	 * post-publish side-effects like cache invalidation or telemetry.
	 */
	readonly onAfterPublish?: (
		ctx: StudioPluginContext<UserConfig>,
		data: PuckData,
	) => void | Promise<void>;

	/**
	 * Fires when `<Studio>` unmounts. Use for cleanup — subscriptions,
	 * timers, event listeners, intervals, etc.
	 */
	readonly onDestroy?: (
		ctx: StudioPluginContext<UserConfig>,
	) => void | Promise<void>;
}

/**
 * Return shape from a plugin's `register()` method.
 *
 * Every field except {@link meta} is optional, so a plugin may:
 *
 * - Register only hooks (pure lifecycle observer).
 * - Register only overrides (pure UI contribution).
 * - Register only export formats (pure serialization plugin).
 * - Or any combination.
 *
 * The runtime routes each field's contribution into its corresponding
 * registry:
 *
 * | Field          | Consumed by                                          |
 * | -------------- | ---------------------------------------------------- |
 * | `hooks`        | `createLifecycleManager()` (`core-008`)              |
 * | `overrides`    | `mergeOverrides()` (curried per-key, `core-014`)     |
 * | `headerActions`| `composeHeaderActions()` (`core-009`)                |
 * | `exportFormats`| `createExportRegistry()` (`core-009`)                |
 *
 * @typeParam UserConfig - Optional Puck config generic. Plumbed to
 * {@link StudioPluginLifecycleHooks} and `PuckOverrides` for strong
 * typing.
 */
export interface StudioPluginRegistration<
	UserConfig extends PuckConfig = PuckConfig,
> {
	/**
	 * Echo of the owning plugin's {@link StudioPluginMeta}.
	 *
	 * Duplicated here (rather than read from the plugin object) so the
	 * runtime can associate every registered artifact — override,
	 * hook, header action, export format — with its source plugin for
	 * diagnostics and error attribution.
	 */
	readonly meta: StudioPluginMeta;

	/**
	 * Optional lifecycle hooks bag.
	 *
	 * See {@link StudioPluginLifecycleHooks}.
	 */
	readonly hooks?: StudioPluginLifecycleHooks<UserConfig>;

	/**
	 * Optional Puck override slot contributions.
	 *
	 * Merged **per-key and curried** by `mergeOverrides()` — two
	 * plugins that both contribute a `header` override are composed so
	 * both run (innermost plugin first), not one-replaces-the-other.
	 * See architecture §18 for the curried-per-key rationale and
	 * `core-014` for the implementation.
	 */
	readonly overrides?: Partial<PuckOverrides<UserConfig>>;

	/**
	 * Optional header action descriptors.
	 *
	 * Pure data; `composeHeaderActions()` turns them into rendered
	 * React nodes. Kept as data (not components) so the runtime can
	 * stay React-free and so core can serialize header state for
	 * tests.
	 */
	readonly headerActions?: readonly StudioHeaderAction[];

	/**
	 * Optional export format definitions.
	 *
	 * Registered into the export registry at compile time; consumed by
	 * `useExportStore.exportAs(formatId)` from the host app or a
	 * header action.
	 */
	readonly exportFormats?: readonly ExportFormatDefinition[];
}

/**
 * The authored plugin object.
 *
 * Plugins are plain objects (not classes) with a frozen `meta` block
 * and a `register()` method that returns a
 * {@link StudioPluginRegistration}. `register()` may be synchronous or
 * asynchronous — the runtime awaits it before moving on to the next
 * plugin in the registration order.
 *
 * @typeParam UserConfig - Optional Puck config generic. Defaults to
 * the Puck default so simple plugins don't need to parameterize it.
 *
 * @example
 * ```ts
 * import type { StudioPlugin } from "@anvilkit/core/types";
 *
 * export const telemetryPlugin: StudioPlugin = {
 *   meta: {
 *     id: "com.example.telemetry",
 *     name: "Telemetry",
 *     version: "1.0.0",
 *     coreVersion: "^0.1.0-alpha",
 *   },
 *   register(ctx) {
 *     return {
 *       meta: telemetryPlugin.meta,
 *       hooks: {
 *         onDataChange(_innerCtx, data) {
 *           ctx.log("debug", "data changed", {
 *             contentNodeCount: data.content.length,
 *           });
 *         },
 *       },
 *     };
 *   },
 * };
 * ```
 */
export interface StudioPlugin<UserConfig extends PuckConfig = PuckConfig> {
	/**
	 * Frozen plugin metadata.
	 *
	 * See {@link StudioPluginMeta}.
	 */
	readonly meta: StudioPluginMeta;

	/**
	 * Produce a registration block for the runtime to consume.
	 *
	 * Called exactly once per plugin, during `compilePlugins()`. May
	 * return synchronously or via a `Promise`.
	 *
	 * @param ctx - The {@link StudioPluginContext} for this session.
	 */
	register(
		ctx: StudioPluginContext<UserConfig>,
	):
		| StudioPluginRegistration<UserConfig>
		| Promise<StudioPluginRegistration<UserConfig>>;
}
