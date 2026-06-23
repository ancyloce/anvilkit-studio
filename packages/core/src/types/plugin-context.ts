/**
 * @file `StudioPluginContext` — the runtime read / write / observe handle
 * passed to every plugin lifecycle call.
 *
 * Extracted from `./plugin.ts` (report finding F7) to isolate the
 * runtime-API surface from the declarative plugin-shape contract. It is
 * re-exported by `./plugin.ts`, so `@anvilkit/core/types` and the internal
 * `@/types/plugin` barrel consumers are unchanged.
 *
 * Pure type module — emits zero runtime JS (the store-handle assertion at
 * the bottom is type-space only).
 */

import type {
	PuckApi,
	Config as PuckConfig,
	Data as PuckData,
} from "@puckeditor/core";

import type { RegistryEntry } from "@/i18n/registry";
import type { IRAssetResolver } from "./asset-resolver.js";
import type { StudioConfig } from "./config.js";
import type { StudioLogLevel } from "./log.js";
import type {
	StudioAssetAction,
	StudioAssetSource,
	StudioCopilotPanel,
	StudioCopySnippetPack,
	StudioDesignSystemPanel,
	StudioHistoryPanel,
	StudioInsertSection,
	StudioLayerQuickAdd,
	StudioPageSettingsSeoFields,
	StudioSeoPanel,
	StudioSidebarUnregister,
} from "./sidebar.js";

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
 *   can observe this one; {@link on} subscribes to events from other
 *   plugins. The bus is per `<Studio>` instance, synchronous, and
 *   delivers in registration order (subscribers typically wire up their
 *   listeners in `register`/`onInit`).
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
	 * Broadcast an event to the Studio plugin event bus, delivering it
	 * synchronously to every handler subscribed via {@link on} (including
	 * other plugins' handlers), in registration order.
	 *
	 * Event names are free-form strings — Core does not enforce a
	 * schema. Subscribers validate payloads themselves. Namespacing the
	 * event with your plugin slug (e.g. `"asset-manager:uploaded"`) is
	 * recommended to avoid collisions.
	 *
	 * Delivery semantics (architecture §8.5):
	 * - **Per-instance.** The bus is scoped to this `<Studio>` instance;
	 *   two editors on a page never cross-deliver.
	 * - **No replay.** Only handlers subscribed at emit time receive the
	 *   event — a later subscriber never sees a past event.
	 * - **Failure-isolated.** A throwing handler is caught, logged, and
	 *   skipped; the remaining handlers still run. `emit` never throws.
	 *
	 * @param event - Event name (plugin-defined).
	 * @param payload - Optional payload. Defaults to `undefined`.
	 */
	readonly emit: (event: string, payload?: unknown) => void;

	/**
	 * Subscribe `handler` to an event name on the Studio plugin event
	 * bus. Returns an unsubscribe function; call it to stop receiving the
	 * event (idempotent). Each `on` call is an independent subscription.
	 *
	 * The payload is `unknown` by contract — validate it in the handler.
	 * Subscribe in `register` or an `onInit` hook so the handler is in
	 * place before peer plugins start emitting; events emitted before you
	 * subscribe are not replayed. See {@link emit} for delivery
	 * semantics.
	 *
	 * @param event - Event name to listen for.
	 * @param handler - Called with the emitted payload.
	 * @returns An unsubscribe function.
	 */
	readonly on: (
		event: string,
		handler: (payload: unknown) => void,
	) => () => void;

	/**
	 * Resolve an i18n message key to a string for the **config** locale
	 * (`studioConfig.i18n.locale`), with `{token}` interpolation.
	 *
	 * A React-free, non-reactive snapshot for register-time strings and
	 * `log` messages — it resolves the core `studio.*` catalog plus any
	 * `studioConfig.i18n.messages` overrides. It does **not** track live
	 * `setLocale` and does **not** resolve plugin-registered namespaces;
	 * reactive UI and plugin-owned strings resolve through `useMsg`
	 * (`@anvilkit/core/i18n`) or a header action's `labelKey` at render.
	 */
	readonly t: (
		key: string,
		vars?: Readonly<Record<string, string | number>>,
	) => string;

	/**
	 * Contribute a namespaced message bundle (static English plus optional
	 * lazy per-locale packs) to this `<Studio>` instance's i18n catalog.
	 *
	 * `entry.namespace` must equal the plugin's slug and must not collide
	 * with a reserved core namespace (`studio` / `canvas`) or another
	 * plugin's namespace — `compilePlugins()` throws otherwise. (`assetManager`
	 * was reserved transitionally and has since been released —
	 * `@anvilkit/plugin-asset-manager` now owns it as a normal plugin
	 * namespace.) Contributed packs join the catalog resolved by `useMsg` at
	 * render.
	 */
	readonly registerMessages: (entry: RegistryEntry) => void;

	/**
	 * Register a runtime asset resolver for export-time URL rewrites.
	 *
	 * Resolvers are consulted by export formats that opt into the
	 * asset-resolution pipeline. A resolver should return `null` for
	 * URLs it does not own, and a rewritten URL when it does.
	 */
	readonly registerAssetResolver: (resolver: IRAssetResolver) => void;

	/**
	 * Return the asset resolvers registered for the current compiled
	 * runtime, in registration order.
	 *
	 * Core supplies this on the context passed to `register()` so plugins
	 * can close over the resolver list for later header-action exports.
	 * Hand-written test contexts may omit it; export formats should treat
	 * absence as an empty resolver list.
	 */
	readonly getAssetResolvers?: () => readonly IRAssetResolver[];

	/**
	 * Register a custom section in the sidebar's `insert` module.
	 *
	 * Default sections (`recommended`, `navigation`, `top`, `team`)
	 * are seeded by `@anvilkit/core` from each component's metadata
	 * category. Plugins use this surface to add curated groupings
	 * (e.g. brand-template sections, AI-generated picks).
	 *
	 * Returns an `unregister()` handle the plugin's `onDestroy` hook
	 * should call to clean up — a remount with a different plugin set
	 * never carries over stale registrations.
	 *
	 * Optional because hand-written test contexts may omit it; the
	 * runtime always provides it on the live `<Studio>` ctx.
	 */
	readonly registerInsertSection?: (
		section: StudioInsertSection,
	) => StudioSidebarUnregister;

	/**
	 * Register a primitive in the sidebar's `layer` module quick-add
	 * popover. Built-ins (Layout / Row / Column / Text) come from
	 * `@anvilkit/core`; plugins use this surface to add custom
	 * primitives (e.g. branded heroes, marketing rows).
	 *
	 * Returns an `unregister()` handle.
	 */
	readonly registerLayerQuickAdd?: (
		item: StudioLayerQuickAdd,
	) => StudioSidebarUnregister;

	/**
	 * Register the `StudioAssetSource` backing the sidebar's `image`
	 * module. v1 supports a single source — last-write-wins; the
	 * sidebar shows `studio.module.image.pluginMissing` until a
	 * source is registered.
	 *
	 * Returns an `unregister()` handle that clears the source iff it
	 * still matches the one captured in its closure (so a chain of
	 * register / re-register / unregister calls behaves predictably).
	 */
	readonly registerAssetSource?: (
		source: StudioAssetSource,
	) => StudioSidebarUnregister;

	/**
	 * Register a plugin-contributed entry in the per-asset overflow
	 * `…` menu. Built-ins (Rename / Replace / Copy URL / Delete) come
	 * from the asset source itself.
	 *
	 * Returns an `unregister()` handle.
	 */
	readonly registerAssetAction?: (
		action: StudioAssetAction,
	) => StudioSidebarUnregister;

	/**
	 * Register a snippet pack consumed by the sidebar's `text` module.
	 * Multiple packs may be registered; the module merges them in
	 * registration order.
	 *
	 * Returns an `unregister()` handle.
	 */
	readonly registerCopySnippetPack?: (
		pack: StudioCopySnippetPack,
	) => StudioSidebarUnregister;

	/**
	 * Register the panel body backing the sidebar's `copilot` module.
	 * v1 supports a single panel — last-write-wins; the sidebar shows
	 * `studio.module.copilot.empty` until a panel is registered.
	 *
	 * Core stays agnostic about any specific AI plugin; the panel is a
	 * plain `render()` thunk so integration packages (or hosts) can own
	 * the React state, plugin reference, and dispatch wiring.
	 *
	 * Returns an `unregister()` handle that clears the panel iff it
	 * still matches the one captured in its closure.
	 */
	readonly registerCopilotPanel?: (
		panel: StudioCopilotPanel,
	) => StudioSidebarUnregister;

	/**
	 * Register the panel body backing the sidebar's `history` module.
	 * v1 supports a single panel — last-write-wins; the sidebar shows
	 * `studio.module.history.empty` until a panel is registered.
	 *
	 * Core stays agnostic about any specific snapshot store; the panel
	 * is a plain `render()` thunk so integration packages (or hosts)
	 * can own the React state, adapter reference, and restore dispatch.
	 *
	 * Returns an `unregister()` handle that clears the panel iff it
	 * still matches the one captured in its closure.
	 */
	readonly registerHistoryPanel?: (
		panel: StudioHistoryPanel,
	) => StudioSidebarUnregister;

	/**
	 * Register the panel body backing the sidebar's `design-system`
	 * module. v1 supports a single panel — last-write-wins; the sidebar
	 * shows `studio.module.designSystem.empty` until a panel is
	 * registered.
	 *
	 * Core stays agnostic about any specific token vocabulary; the
	 * panel is a plain `render()` thunk so integration packages (or
	 * hosts) can own the React state, token tree, and theme-toggle
	 * dispatch.
	 *
	 * Returns an `unregister()` handle that clears the panel iff it
	 * still matches the one captured in its closure.
	 */
	readonly registerDesignSystemPanel?: (
		panel: StudioDesignSystemPanel,
	) => StudioSidebarUnregister;
	/**
	 * Register the SEO rail panel (PRD 0004 F5). Single-occupancy,
	 * last-write-wins; returns an `unregister()` handle that clears the panel
	 * iff it still matches the one captured in its closure.
	 */
	readonly registerSeoPanel?: (
		panel: StudioSeoPanel,
	) => StudioSidebarUnregister;
	/**
	 * Register the SEO field group rendered inside the `layer` module's
	 * page-settings dialog. Unlike {@link registerSeoPanel} (which edits the
	 * active Puck doc), this seam edits any page row's stored SEO via core's
	 * controlled `value`/`onChange` props — keeping the SEO field UI in
	 * `@anvilkit/plugin-page-seo` rather than core chrome. Single-occupancy,
	 * last-write-wins; returns an `unregister()` handle that clears the fields
	 * iff they still match the one captured in its closure.
	 */
	readonly registerPageSettingsSeoFields?: (
		fields: StudioPageSettingsSeoFields,
	) => StudioSidebarUnregister;
}

/**
 * Store-isolation invariant (A4): plugins mutate Studio **only**
 * through the typed `register*` thunks and lifecycle hooks above —
 * never a raw store handle. The `<Studio>` shell enforces this by
 * *construction* (the ctx object it builds simply omits any store
 * reference). The assertion below makes that intent fail-loud: if a
 * `*Store` / `*store` key is ever added to `StudioPluginContext`,
 * `_AssertTrue` receives `false` and violates its `extends true`
 * constraint, so `typecheck` fails — forcing a deliberate decision
 * rather than a silent leak of the engine's write side to plugins.
 *
 * Pure type space — emits **zero** runtime JS, preserving the
 * type-only purity of `src/types/` (no `const`, no `void`).
 */
type _AssertTrue<_T extends true> = never;
type _StoreHandleKeys = Extract<
	keyof StudioPluginContext,
	`${string}Store` | `${string}store`
>;
type _AssertNoStoreHandleOnContext = _AssertTrue<
	[_StoreHandleKeys] extends [never] ? true : false
>;
