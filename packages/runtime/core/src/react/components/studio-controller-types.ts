/**
 * @file Type surface for `useStudioController` / `<Studio>` — extracted
 * from `use-studio-controller.ts` (review finding P2-1) so the
 * orchestration file is logic, not ~250 lines of prop declarations.
 *
 * Every type here was previously declared inline in the controller and
 * is re-exported from it unchanged, so the public `@anvilkit/core/react`
 * surface (`{ StudioProps }`, threaded through `Studio.tsx`) and the
 * view↔controller import graph are byte-identical.
 */

import type { DeepPartial } from "@anvilkit/utils";
import type {
	Config as PuckConfig,
	Data as PuckData,
	OnAction as PuckOnAction,
	Overrides as PuckOverrides,
	Plugin as PuckPlugin,
	UiState as PuckUiState,
	Viewports as PuckViewports,
	UserGenerics,
	useGetPuck,
} from "@puckeditor/core";
import type { ReactNode, RefObject } from "react";

import type { StudioChromeMode } from "@/overrides/types";
import type { StudioRuntime } from "@/runtime/compile-plugins";
import type { StudioAnalyticsPort } from "@/shared/analytics-port";
import type { EditorStoreBundle } from "@/state/editor-store-bundle";
import type {
	AiStoreApi,
	ExportStoreApi,
	SidebarRegistryStoreApi,
	ThemeStoreApi,
} from "@/state/index";
import type { StudioConfig } from "@/types/config";
import type { StudioPagesSource } from "@/types/pages";
import type { StudioPlugin, StudioPluginContext } from "@/types/plugin";
import type { StudioLogger } from "./studio-log.js";

/**
 * Live `useGetPuck` snapshot accessor captured inside Puck's subtree by
 * the controller's `PuckApiBinder`. Derived from Puck's own
 * `useGetPuck` return type so a breaking change there fails to compile.
 */
export type GetPuckSnapshot = ReturnType<typeof useGetPuck>;

export interface CompiledStudioRuntime {
	readonly runtime: StudioRuntime;
	readonly studioConfig: StudioConfig;
	readonly ctx: StudioPluginContext;
}

/** Dynamically-loaded AnvilKit chrome assets (null on `chrome="puck"`). */
export interface ChromeAssets {
	readonly studioOverrides: Partial<PuckOverrides>;
	readonly StudioLayout: import("react").ComponentType<
		import("@/layout/StudioLayout").StudioLayoutProps
	>;
}

/**
 * The compiled runtime as held in state, tagged with the `compileKey`
 * (the input-identity token) that produced it and the chrome assets
 * compiled alongside it. A render whose current `compileKey` no longer
 * matches a stored runtime's treats it as absent — see `activeCompiled`
 * in `useStudioController`. Internal: consumers receive the public
 * {@link CompiledStudioRuntime} shape.
 */
export interface StoredRuntime extends CompiledStudioRuntime {
	readonly compileKey: object;
	readonly chromeAssets: ChromeAssets | null;
}

/**
 * The Puck `Data` shape for a given `UserConfig`, derived from Puck's
 * own `UserGenerics`. Collapses to the broad default `Data` (the prior
 * non-generic `PuckData`) when `UserConfig` is the default
 * `PuckConfig`, so every existing non-generic caller is byte-identical
 * at the type level.
 */
type PuckDataFor<UserConfig extends PuckConfig> =
	UserGenerics<UserConfig>["UserData"];

/**
 * Props accepted by `<Studio>` and consumed by the controller. Lives
 * here (not in `Studio.tsx`) so there is **no import cycle** between
 * the view and its controller — `Studio.tsx` re-exports it to keep the
 * public `@anvilkit/core/react` path (`{ StudioProps }`) unchanged.
 *
 * Mirrors the subset of `<Puck>`'s props meaningful at the Studio
 * shell level, plus the Studio-specific `plugins`, `config`, and
 * legacy `aiHost` slots. Kept a plain interface (not
 * `PropsWithChildren`) because `<Studio>` delegates its entire UI to
 * `<Puck>`.
 */
export interface StudioProps<UserConfig extends PuckConfig = PuckConfig> {
	/**
	 * The Puck component config the editor operates on. Typically
	 * imported from a host-side module like
	 * `apps/demo/lib/puck-demo.ts` that aggregates every
	 * `@anvilkit/*` component package's `componentConfig` into a
	 * single `PuckConfig`. The inferred `UserConfig` flows into
	 * `data`, `onChange`/`onPublish`, `plugins`, and `overrides`, so an
	 * externally-typed `StudioPlugin<UserConfig>` keeps its type
	 * contribution through `<Studio>` (the typing is realized via
	 * {@link StudioPlugin}, not a generic runtime — the runtime erases
	 * to the default at the `compilePlugins` boundary).
	 */
	readonly puckConfig: UserConfig;
	/**
	 * Initial Puck page data. Forwarded to `<Puck>` verbatim and
	 * also captured into a ref so {@link StudioPluginContext.getData}
	 * returns the latest snapshot.
	 */
	readonly data?: PuckDataFor<UserConfig>;
	/**
	 * StudioPlugins (and/or raw `@puckeditor/core` plugins) to mount.
	 * Order matters for override composition: the first plugin's
	 * overrides become the innermost wrapper, later plugins wrap it.
	 *
	 * Consumers that want to recover the contributed capability types
	 * from this set can declare the array `as const` and apply
	 * {@link InferPluginContributions}`<typeof plugins>` — the tuple
	 * preserves each plugin's `StudioPlugin<_, Contributes>` parameter,
	 * which the helper distributes into a union. The runtime erases at
	 * the `compilePlugins` boundary regardless.
	 */
	readonly plugins?: readonly (
		| StudioPlugin<UserConfig>
		| PuckPlugin<UserConfig>
	)[];
	/**
	 * Layer 3 host overrides forwarded to `createStudioConfig`.
	 * `<Studio>` owns the config factory call so descendants get a
	 * single `StudioConfigProvider`-scoped instance.
	 */
	readonly config?: DeepPartial<StudioConfig>;
	/**
	 * Consumer-supplied Puck overrides. Composed **outermost** —
	 * after the plugins' overrides — so the consumer always has the
	 * final word on any given slot.
	 */
	readonly overrides?: Partial<PuckOverrides<UserConfig>>;
	/**
	 * Forwarded to `<Puck onChange>` after the `onDataChange`
	 * lifecycle has fired.
	 */
	readonly onChange?: (data: PuckDataFor<UserConfig>) => void;
	/**
	 * Forwarded to `<Puck onPublish>` **only if** the
	 * `onBeforePublish` lifecycle resolves without throwing.
	 */
	readonly onPublish?: (data: PuckDataFor<UserConfig>) => void | Promise<void>;
	/**
	 * @deprecated Legacy `aiHost` string. When provided, `<Studio>`
	 * dynamically imports `@anvilkit/core/compat/ai-host-adapter` and
	 * prepends the adapter to the plugin list. Migrate to
	 * `createAiGenerationPlugin()` from
	 * `@anvilkit/plugins/ai-generation`.
	 */
	readonly aiHost?: string;
	/**
	 * Which chrome to render. `"anvilkit"` (default) mounts the
	 * AnvilKit Studio shell; `"puck"` ships the raw `@puckeditor/core`
	 * UI (bit-for-bit pre-Phase-5 output).
	 */
	readonly chrome?: StudioChromeMode;
	/**
	 * Initial Puck `UiState` partial. When `chrome="anvilkit"` it is
	 * merged with the chrome's full-width-viewport defaults via
	 * `mergeStudioUi()`.
	 */
	readonly ui?: Partial<PuckUiState>;
	/** Forwarded to `<Puck onAction>` — every Puck action dispatch. */
	readonly onAction?: PuckOnAction<PuckDataFor<UserConfig>>;
	/** Forwarded to `<Puck viewports>`. */
	readonly viewports?: PuckViewports;
	/**
	 * Per-instance store id. Persisted `EditorUiState` keys live under
	 * `anvilkit-ui-${storeId}`, so two `<Studio>` instances on one
	 * page should pass distinct ids.
	 *
	 * **Keep this stable for a given mount** (review finding Z-b/Z-2):
	 * the injected theme/export/ai stores freeze their resolved store id
	 * via `useState` at create time and do **not** re-key on a live
	 * `storeId` change. To re-target persistence (e.g. switch documents),
	 * remount `<Studio>` with a new React `key` rather than changing
	 * `storeId` in place.
	 */
	readonly storeId?: string;
	/** Optional "back" handler for the chrome header. Hidden when absent. */
	readonly onBack?: () => void;
	/** Optional "save draft" handler; header surfaces a button when set. */
	readonly onSaveDraft?: () => void | Promise<void>;
	/** Drives the "save draft" button's loading state. */
	readonly isSavingDraft?: boolean;
	/** Timestamp of the last successful save (relative-time hint). */
	readonly lastSavedAt?: Date | null;
	/** Drives the "Publish" button's loading state. */
	readonly isPublishing?: boolean;
	/**
	 * Optional click handler for the panel's "Publish to live" action.
	 * Disabled when omitted. The Puck `onPublish` pipeline still fires
	 * through Puck's own publish UI; this exists so the AnvilKit chrome
	 * can offer a header button wired to the host's publish flow.
	 *
	 * Receives the **live** editor document (read from the Puck API at
	 * click time), so the host publishes current edits rather than a
	 * stale snapshot. A `() => void` handler stays assignable (the data
	 * arg is simply ignored).
	 */
	readonly onPublishClick?: (data: PuckData) => void;
	/**
	 * Optional click handler for the chrome header's Preview action (the
	 * ▶ button). Disabled when omitted. Receives the **live** editor document
	 * (read from the Puck API at click time), so the host previews current
	 * edits rather than a stale snapshot — e.g. opening a render route in a new
	 * tab. A `() => void` handler stays assignable (the data arg is ignored).
	 */
	readonly onPreview?: (data: PuckData) => void;
	/**
	 * Optional handler invoked from the publish panel's Export submenu
	 * with the format id. The host normalizes Puck data to `PageIR`,
	 * calls `runtime.exportFormats.get(formatId).run(ir, options)`, and
	 * triggers the download. The submenu disables itself when omitted.
	 */
	readonly onExport?: (formatId: string) => void | Promise<void>;
	/**
	 * Optional host node rendered in the chrome header's right-hand action
	 * cluster (between the plugin header actions and the Preview / Publish
	 * controls). The supported seam for arbitrary host header content — e.g.
	 * `<LanguageSwitcher />` from `@anvilkit/core/i18n`. Ignored when
	 * `chrome="puck"`. Memoize it host-side so the chrome-props context value
	 * stays stable across `<Studio>` re-renders.
	 */
	readonly headerEnd?: ReactNode;
	/**
	 * Optional diagnostics sink for plugin log records and Studio setup
	 * failures. Metadata is shallow-redacted before delivery.
	 */
	readonly logger?: StudioLogger;
	/**
	 * Optional pages source for the sidebar's `layer` module. Ignored
	 * when `chrome="puck"`.
	 */
	readonly pages?: StudioPagesSource;
	/**
	 * Per-instance i18n overrides forwarded to
	 * `EditorI18nProvider`. Keys are message ids
	 * (`studio.module.*`). Ignored when `chrome="puck"`.
	 *
	 * This flat map is **locale-agnostic** — it applies to every locale —
	 * and still wins over `config.i18n.messages` during its migration
	 * window (do not use both).
	 *
	 * @deprecated Use `config.i18n.messages` (a per-locale
	 * `locale → (messageKey → string)` map) instead. Removal in 0.2.0.
	 */
	readonly messages?: Readonly<Record<string, string>>;
	/**
	 * Locale-change notification (config-centric i18n).
	 *
	 * - **Controlled** (`config.i18n.locale` explicitly set by the host):
	 *   fired when something inside requests a switch (the built-in
	 *   `LanguageSwitcher` when `config.i18n.showLocaleSwitch` is on); the
	 *   store does NOT change until the host re-renders with the new
	 *   `config.i18n.locale` — exactly like a controlled `<input>`.
	 * - **Uncontrolled**: fired *after* the store applied (and persisted)
	 *   the switch — a sync tap for routers/cookies/analytics; ignoring it
	 *   changes nothing.
	 */
	readonly onLocaleChange?: (locale: string) => void;
	/**
	 * Optional node rendered while the runtime compiles (and, for
	 * anvilkit chrome, while the lazily-loaded chrome assets resolve).
	 * Lets a host supply its own branded skeleton without wrapping
	 * `<Studio>` in a loading-state machine. A supplied node always wins
	 * over the built-in default.
	 *
	 * Default when omitted:
	 * - `chrome="anvilkit"` (the default): the built-in
	 *   `StudioLoadingScreen` skeleton (skeleton rail / panel / header +
	 *   a spinner-and-text canvas), so the pre-compile window shows the
	 *   editor's shape instead of a blank frame.
	 * - `chrome="puck"`: bare `null`, exactly as before — the legacy path
	 *   stays byte-for-byte identical to pre-Phase-5 Puck.
	 *
	 * Kept a plain `ReactNode` (not a render-prop) so it stays trivially
	 * passthrough and does not couple the host skeleton to runtime
	 * internals — a host that wants to paint deferred-plugin toolbar
	 * placeholders can compute them from its own plugin metas'
	 * `staticHeaderActions` (3.3) and render them inside this node.
	 */
	readonly loading?: ReactNode;
	/**
	 * Optional analytics sink. Typed as the runtime-owned
	 * {@link StudioAnalyticsPort} — every `@anvilkit/analytics-core` adapter
	 * satisfies it structurally. When set, `<Studio>` emits the system events
	 * `draft_saved` / `page_published` / `component_dropped` with lightweight
	 * props only. Omitting it is a complete no-op — `<Studio>` behaves
	 * identically.
	 */
	readonly analytics?: StudioAnalyticsPort;
	/**
	 * Called when the plugin runtime fails to compile (a plugin's
	 * `register` throws or rejects). Receives the thrown value. Fires once
	 * per failed compile; a later successful recompile does not re-notify.
	 * Use it for host-side error reporting — it does not replace the
	 * on-screen error UI (see {@link errorFallback}). Read through a ref, so
	 * an inline handler never triggers a recompile.
	 */
	readonly onError?: (error: unknown) => void;
	/**
	 * Rendered in place of the editor when the plugin runtime fails to
	 * compile, instead of the component hanging on the loading fallback
	 * forever. Either a static node or a render function receiving the
	 * thrown value. When omitted, `<Studio>` renders a built-in recoverable
	 * error screen (with a Retry action). A successful retry/recompile
	 * clears the error and mounts the editor.
	 */
	readonly errorFallback?: ReactNode | ((error: unknown) => ReactNode);
}

/** What the thin `<Studio>` view needs back from the controller. */
export interface StudioControllerState {
	readonly isAnvilkit: boolean;
	readonly compiled: CompiledStudioRuntime | null;
	/**
	 * The thrown value from a failed plugin compile, or `null` while a
	 * compile is in flight or succeeded. Drives the view's error branch
	 * (`errorFallback` / the built-in error screen); reset on each new
	 * compile attempt so a retry/recompile recovers.
	 */
	readonly compileError: unknown;
	/**
	 * Forces a fresh compile with the **same** inputs (bumps an internal
	 * nonce folded into the compile identity). Wired to the built-in error
	 * screen's Retry action and exposed so a custom `errorFallback` can
	 * offer its own retry. A no-op-safe stable callback.
	 */
	readonly retry: () => void;
	/**
	 * The compiled `studioConfig` with the host's **latest raw `i18n`**
	 * overlaid (`mergeLiveI18n`) — the config React readers see. The
	 * `i18n` block is excluded from the compile fingerprint
	 * (`stripReactiveConfig`), so a live `config.i18n.*` change updates
	 * this overlay (and the chrome) without a plugin recompile; the
	 * `compiled.studioConfig` snapshot stays frozen for `ctx`. `null`
	 * exactly when {@link compiled} is `null`.
	 */
	readonly liveStudioConfig: StudioConfig | null;
	readonly chromeAssets: ChromeAssets | null;
	readonly mergedOverrides: Partial<PuckOverrides>;
	readonly handleChange: (next: PuckData) => void;
	readonly handlePublish: (next: PuckData) => void;
	/**
	 * The AnvilKit chrome `PublishPanel`'s "Publish to live" handler — the
	 * host's `onPublishClick` wrapped through the SAME `runPublishPipeline`
	 * as {@link handlePublish}, so a chrome publish emits `page_published`
	 * on success exactly like Puck's native publish. `undefined` when the
	 * host wired no `onPublishClick` (the panel button then stays disabled).
	 */
	readonly handlePublishClick?: (next: PuckData) => void;
	/** Puck `onAction` wrapped to emit `component_dropped` on insert. */
	readonly handleAction: PuckOnAction;
	/**
	 * Host `onSaveDraft` wrapped to emit `draft_saved`, or `undefined` when the
	 * host provides no save handler (so the save affordance stays hidden).
	 */
	readonly handleSaveDraft?: () => void | Promise<void>;
	readonly themeStore: ThemeStoreApi;
	readonly exportStore: ExportStoreApi;
	readonly aiStore: AiStoreApi;
	/**
	 * The coordinated editor-store bundle (theme/export/ai/ui). The anvilkit
	 * chrome passes this to the single `<EditorStoreProvider>`; the
	 * `themeStore`/`exportStore`/`aiStore` fields above are views onto it for
	 * the legacy puck trio and imperative driving.
	 */
	readonly editorStore: EditorStoreBundle;
	readonly sidebarRegistryStore: SidebarRegistryStoreApi;
	readonly resolvedStoreId: string;
	readonly rootRef: RefObject<HTMLDivElement | null>;
}
