/**
 * @file The Studio plugin contract — the frozen public promise
 * `@anvilkit/core` makes to plugin authors for the `0.1.x` alpha line.
 *
 * ### Design rules
 *
 * 1. **Zero React runtime dependency.** Every Puck type and the React
 *    `ComponentType` / `ReactNode` references below are imported via
 *    `import type` and erased at compile time. With
 *    `verbatimModuleSyntax: true` in the tsconfig, the emitted `.js`
 *    file contains no reference to `@puckeditor/core` or React — this
 *    file ships as pure type information.
 *
 *    Note that the plugin contract DOES reference React types
 *    ({@link StudioPluginProvider.component}, {@link StudioPluginOverlay.component},
 *    {@link StudioPluginSlotContribution.component}) — this is an
 *    intentional boundary change from the original "no React anywhere"
 *    rule. The `runtime/` layer continues to treat these as opaque
 *    (the runtime never reads or instantiates them); the React boundary
 *    is `<Studio>` (`packages/core/src/react/components/Studio.tsx`).
 *    See architecture §17 for the updated boundary.
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
 *
 *    Additive-only opt-in: {@link StudioPluginContributing} is a *new*
 *    sub-interface keyed by a `unique symbol` so plugin authors can
 *    advertise a `Contributes` capability surface that `<Studio>`
 *    consumers recover via {@link InferPluginContributions}. The base
 *    {@link StudioPlugin} shape and variance are unchanged, so existing
 *    plugins and `coreVersion` ranges keep working without modification.
 */

import type {
	PuckApi,
	Config as PuckConfig,
	Data as PuckData,
	Overrides as PuckOverrides,
	Plugin as PuckPlugin,
} from "@puckeditor/core";
import type { ComponentType, ReactNode } from "react";

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
	 * (e.g. `"^0.1.0"`).
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

	/**
	 * Optional declarative capability hints.
	 *
	 * Used by host tooling (settings UIs, plugin discovery) to query
	 * what surfaces a plugin contributes without compiling it. Purely
	 * advisory: the runtime continues to drive UI visibility from
	 * actual `register*()` calls into the sidebar registry, not from
	 * this flag.
	 */
	readonly capabilities?: StudioPluginCapabilities;
}

/**
 * Declarative capability flags carried on {@link StudioPluginMeta}.
 *
 * Each flag is an optional self-declaration by the plugin author. The
 * runtime does not enforce these — they exist so host code can list
 * "all sidebar plugins" or "all plugins exporting HTML" without
 * mounting the plugin first.
 */
export interface StudioPluginCapabilities {
	/**
	 * `true` when the plugin contributes sidebar UI (asset source,
	 * copilot panel, history panel, design-system panel, copy snippet
	 * pack, etc.).
	 */
	readonly sidebar?: boolean;
}

export type { AssetResolution, IRAssetResolver } from "./asset-resolver.js";

import type { IRAssetResolver } from "./asset-resolver.js";
import type {
	StudioAssetAction,
	StudioAssetSource,
	StudioCopilotPanel,
	StudioCopySnippetPack,
	StudioDesignSystemPanel,
	StudioHistoryPanel,
	StudioInsertSection,
	StudioLayerQuickAdd,
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
	 * @reserved **Not implemented yet (architecture §12).** The
	 * plugin-to-plugin bus has no delivery: calling `emit` is inert,
	 * never throws, and no subscriber receives the event. The
	 * `<Studio>` shell logs a warning on the first call per plugin
	 * context (every environment — rate-limited to once) so the inert
	 * contract is discoverable without reading the implementation. Do
	 * not rely on delivery until a concrete subscribe API and ordering
	 * semantics are documented here. The signature is stable; only the
	 * runtime behavior changes when the bus ships.
	 *
	 * @param event - Event name (plugin-defined).
	 * @param payload - Optional payload. Defaults to `undefined`.
	 */
	readonly emit: (event: string, payload?: unknown) => void;

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
	 *
	 * **Resolvable set.** The shell resolves against a *curated*
	 * registry (not all of `lucide-react`) so the chrome bundle
	 * tree-shakes to only the icons it ships — a namespace import would
	 * retain every Lucide icon. Name matching is case/separator
	 * insensitive (`"download"`, `"Download"`, `"down-load"` all
	 * resolve). A name outside the registry resolves to no icon (the
	 * label still renders). To add an icon, extend `ICON_REGISTRY` in
	 * `react/studio/layout/HeaderActionButton.tsx` (and the chrome-path
	 * bundle-budget gate covers the size impact).
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
 * React provider contributed by a plugin via
 * {@link StudioPluginRegistration.providers}. The Studio shell composes
 * every contributed provider around the editor tree (inside
 * `StudioRuntimeProvider`, so each provider's component may call
 * `useStudio()`).
 *
 * ### Composition order
 *
 * Providers are sorted ascending by {@link order} (ties break on
 * registration order). The provider with the **lowest** order ends up
 * **outermost**, mirroring the conventional "wrap from the outside in"
 * intuition.
 *
 * ### Why `ComponentType` and not `ReactNode`?
 *
 * A `ReactNode` would be captured at `register()` time and never
 * re-render with new hook state inside the provider. Plugins authoring
 * a provider commonly need their own hooks (e.g. `useEffect` for
 * presence sync) — those only work when React instantiates the
 * component fresh on each render pass.
 */
export interface StudioPluginProvider {
	/**
	 * Stable, globally-unique provider identifier
	 * (e.g. `"collab-ui"`, `"feature-flags"`). Used for diagnostics and
	 * for the "first registration wins" rule on duplicate ids.
	 */
	readonly id: string;

	/**
	 * The provider component. Must render its `children` somewhere in
	 * its tree (otherwise the entire Studio shell becomes empty).
	 */
	readonly component: ComponentType<{ children: ReactNode }>;

	/**
	 * Optional sort key. Lower values render **outermost**. Default
	 * `100`. Ties break on registration order for determinism.
	 */
	readonly order?: number;
}

/**
 * Placement targets for plugin-contributed overlays. Each placement
 * corresponds to a distinct slot inside `<Studio>`:
 *
 * - `"viewport"` — rendered **before** the Puck editor, at the top of
 *   the editor surface. Use for global banners, viewport-scoped
 *   affordances.
 * - `"canvas"` — rendered **after** the Puck editor (DOM-wise) so it
 *   layers above canvas content via CSS. Use for cursors, selection
 *   rings, presence rings — anything that needs to overlay the
 *   editing canvas.
 * - `"notifications"` — rendered last, after all other overlays. Use
 *   for toast surfaces, conflict-resolution dialogs, and other
 *   stack-ordered notification UI.
 */
export type StudioOverlayPlacement = "canvas" | "viewport" | "notifications";

/**
 * Top-level overlay contributed by a plugin via
 * {@link StudioPluginRegistration.overlays}. Overlays render as
 * siblings of the Puck editor at the placement specified by
 * {@link placement} (see {@link StudioOverlayPlacement}).
 *
 * Overlays cannot inject themselves into Puck slots (that's what
 * {@link StudioPluginRegistration.overrides} is for) — they live one
 * level above the editor in the DOM. Common uses: presence cursors,
 * conflict toasts, comment threads, AI hint bubbles.
 */
export interface StudioPluginOverlay {
	/**
	 * Stable, globally-unique overlay identifier
	 * (e.g. `"collab-presence"`, `"collab-conflicts"`).
	 */
	readonly id: string;

	/**
	 * Where Studio should mount the overlay relative to the Puck editor.
	 * See {@link StudioOverlayPlacement}.
	 */
	readonly placement: StudioOverlayPlacement;

	/**
	 * The overlay component. Receives no props.
	 */
	readonly component: ComponentType;

	/**
	 * Optional sort key within the same placement bucket. Lower values
	 * render first. Default `100`. Ties break on registration order.
	 */
	readonly order?: number;
}

/**
 * Identifier of a named chrome slot a plugin can fill. Today only
 * `"collaborators"` is enumerated (the header collaborator stack); new
 * slots are added as features land. The string-union form leaves the
 * type open so plugin authors can target future slots without a Core
 * type bump.
 */
export type StudioSlotId = "collaborators" | (string & {});

/**
 * Named chrome slot contribution — a plugin claims a specific anchor
 * (e.g. the header collaborator stack) and supplies the component
 * Studio should render there.
 *
 * ### Precedence
 *
 * Slots are single-occupancy. If two plugins contribute the same slot
 * id, the **first registration wins** and a `warn` is logged via the
 * plugin context — this matches the {@link StudioHeaderAction} dedupe
 * policy. Host apps can always override a plugin slot by passing the
 * corresponding `<Studio>` prop (e.g. `collaboratorsSlot`); the host
 * prop wins.
 */
export interface StudioPluginSlotContribution {
	/**
	 * Target slot id. See {@link StudioSlotId} for the enumerated
	 * values; new slot ids may be introduced without a Core type bump.
	 */
	readonly id: StudioSlotId;

	/**
	 * The component to mount in the slot. Receives no props.
	 */
	readonly component: ComponentType;

	/**
	 * Optional sort key (currently unused because slots are single-
	 * occupancy, but reserved for future multi-occupancy slots).
	 */
	readonly order?: number;
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
	 * Fires exactly once, after `<Puck>` has mounted and its
	 * effect-time API binder has captured `getPuckApi()` — i.e. the
	 * first moment a plugin may safely call `ctx.getPuckApi()`. Fires
	 * after `onInit` has been dispatched. Use for one-time setup that
	 * must touch the live Puck API on first paint (e.g. collab
	 * hydration of a preloaded snapshot) — work that is too early in
	 * `onInit`, where the binder does not yet exist.
	 */
	readonly onReady?: (
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
 * | `providers`    | `<Studio>` shell composition (`core-014`)            |
 * | `overlays`     | `<Studio>` shell, dispatched by placement            |
 * | `slots`        | `<Studio>` shell, single-occupancy chrome anchors    |
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
	 * the host's export action or a header action.
	 */
	readonly exportFormats?: readonly ExportFormatDefinition[];

	/**
	 * Optional React provider contributions that wrap the Studio tree.
	 *
	 * Sorted ascending by `order` (default `100`); ties break on plugin
	 * registration order. The provider with the lowest order is
	 * **outermost** in the rendered tree. All providers compose inside
	 * `StudioRuntimeProvider`, so each provider's component may call
	 * `useStudio()`.
	 *
	 * See {@link StudioPluginProvider}.
	 */
	readonly providers?: readonly StudioPluginProvider[];

	/**
	 * Optional top-level overlay components rendered as siblings of the
	 * Puck editor. Each overlay declares a {@link StudioOverlayPlacement}
	 * to control where Studio mounts it (canvas / viewport /
	 * notifications).
	 *
	 * Sorted within their placement bucket by `order` (default `100`);
	 * ties break on registration order.
	 */
	readonly overlays?: readonly StudioPluginOverlay[];

	/**
	 * Optional named chrome slot contributions. Slots are single-
	 * occupancy: if two plugins contribute the same slot id, the first
	 * registration wins (and a warn is logged via `ctx.log`).
	 *
	 * Host apps can always override a plugin slot by passing the
	 * corresponding `<Studio>` prop (e.g. `collaboratorsSlot`); the host
	 * prop wins.
	 *
	 * See {@link StudioPluginSlotContribution}.
	 */
	readonly slots?: readonly StudioPluginSlotContribution[];
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
 *     coreVersion: "^0.1.0",
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

/**
 * Module-private capability brand for {@link StudioPluginContributing}.
 *
 * A `unique symbol` property name lives in its own namespace, so adding
 * it to a sub-interface leaves the base {@link StudioPlugin} shape (and
 * its variance) untouched. The property never exists at runtime — the
 * brand carries the `Contributes` type only, and consumers interact
 * exclusively through {@link StudioPluginContributing} and
 * {@link InferPluginContributions}.
 */
declare const StudioPluginContributesBrand: unique symbol;

/**
 * A `StudioPlugin` that advertises a `Contributes` capability surface.
 *
 * Plugin authors return one via {@link defineStudioPlugin} so the
 * contributed types are recoverable through
 * {@link InferPluginContributions}:
 *
 * ```ts
 * export function createThingPlugin(): StudioPluginContributing<ThingApi> {
 *   return defineStudioPlugin<ThingApi>({ meta, register });
 * }
 * ```
 *
 * Implementation note: the brand property is required at the type level
 * (so unbranded `StudioPlugin` cannot accidentally satisfy
 * {@link InferPluginContributions} and contribute `unknown` to the
 * inferred union) but is `unique symbol`-keyed, so it never collides
 * with real properties and is erased at runtime — no value is ever
 * produced or read. The required-but-erased shape is fulfilled by the
 * type-only cast inside `defineStudioPlugin`.
 */
export interface StudioPluginContributing<Contributes>
	extends StudioPlugin<PuckConfig> {
	readonly [StudioPluginContributesBrand]: Contributes;
}

/**
 * Brand a plain `StudioPlugin` literal as
 * {@link StudioPluginContributing}`<Contributes>`.
 *
 * Pure type-level cast — the runtime value is the same object the caller
 * passed in. Exists because the brand property is required on the
 * sub-interface (to prevent inference pollution) but has no runtime
 * representation; this helper concentrates the unavoidable `as` cast in
 * one place so plugin authors don't sprinkle it across factories.
 */
export function defineStudioPlugin<Contributes>(
	plugin: StudioPlugin<PuckConfig>,
): StudioPluginContributing<Contributes> {
	return plugin as StudioPluginContributing<Contributes>;
}

/** Either a Studio plugin or a raw `@puckeditor/core` plugin. */
export type StudioAnyPlugin<UserConfig extends PuckConfig = PuckConfig> =
	| StudioPlugin<UserConfig>
	| PuckPlugin<UserConfig>;

/**
 * Infer the union of contribution types from a plugins tuple.
 *
 * Distributes over the tuple, picks up the branded `Contributes` from
 * any {@link StudioPluginContributing} element, and collapses everything
 * else (raw `StudioPlugin`, `PuckPlugin`, …) to `never`. The brand key
 * on the conditional is **required** (not `?`), so an unbranded
 * `StudioPlugin` does not match and cannot contribute `unknown`.
 */
export type InferPluginContributions<Plugins extends readonly unknown[]> = {
	[Index in keyof Plugins]: Plugins[Index] extends {
		readonly [StudioPluginContributesBrand]: infer Contributes;
	}
		? Contributes
		: never;
}[number];
