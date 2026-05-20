/**
 * @file Sidebar plugin extension contracts.
 *
 * The four switchable modules each expose a typed extension surface
 * so plugins can contribute without forking the sidebar. These types
 * are pure type-only declarations — importing them adds zero bytes to
 * the runtime bundle.
 *
 * Each `register*` method on {@link StudioPluginContext} accepts one
 * of these shapes and returns an `unregister()` handle the plugin's
 * `onDestroy` lifecycle hook should call to clean up.
 *
 * @see {@link ../../../docs/PRD/StudioSidebar_Modules_Addition_Claude.md | StudioSidebar PRD §11}
 */

import type { ReactNode } from "react";
import type {
  PuckApi,
  ComponentData as PuckComponentData,
} from "@puckeditor/core";

// -----------------------------------------------------------------------------
// `insert` module — Component Library
// -----------------------------------------------------------------------------

/**
 * Predicate used by `registerInsertSection()` to decide which
 * components belong in this section. Receives the component name (a
 * Puck Config key) and may inspect the component's metadata category
 * via the second argument.
 */
export type StudioInsertSectionPredicate = (
  componentName: string,
  metadata: { readonly category?: string } | undefined,
) => boolean;

/**
 * A collapsible section in the `insert` module. Default sections
 * (`recommended`, `navigation`, `top`, `team`) are seeded by
 * `@anvilkit/core` from each component's metadata category; plugins
 * can register additional sections via `registerInsertSection()`.
 */
export interface StudioInsertSection {
  /** Stable id. Used as the persisted-expansion key. */
  readonly id: string;
  /**
   * i18n key for the section header label
   * (e.g. `"studio.module.insert.section.recommended"`).
   */
  readonly titleKey: string;
  /**
   * Filter that decides which components fall into this section.
   * The first matching section wins — order matters.
   */
  readonly predicate: StudioInsertSectionPredicate;
  /** Optional explicit position; lower renders first. */
  readonly order?: number;
}

// -----------------------------------------------------------------------------
// `layer` module — Pages & Layers (Layers sub-panel)
// -----------------------------------------------------------------------------

/**
 * Inserter callback handed to a `registerLayerQuickAdd` item when the
 * user clicks it in the `+` quick-add popover. Plugins use the
 * `puckApi` to dispatch a `setData`/`insert` action that drops the
 * primitive into the canvas.
 */
export type StudioLayerQuickAddInserter = (api: {
  readonly puckApi: PuckApi;
  readonly currentSelection: PuckComponentData | null;
}) => void | Promise<void>;

/**
 * A primitive entry in the `layer` module's "+" quick-add popover.
 * Built-ins (`Layout`, `Row`, `Column`, `Text`) are seeded by
 * `@anvilkit/core`; plugins can append their own.
 */
export interface StudioLayerQuickAdd {
  readonly id: string;
  /** i18n key for the row label. */
  readonly labelKey: string;
  /** Optional `lucide-react` icon name. */
  readonly icon?: string;
  readonly insert: StudioLayerQuickAddInserter;
  readonly order?: number;
}

// -----------------------------------------------------------------------------
// `image` module — Assets
// -----------------------------------------------------------------------------

/**
 * The kind of asset surfaced by a {@link StudioAssetSource}. Drives
 * which sub-panel layout (image grid / video card / audio row) the
 * sidebar uses for the tile.
 */
export type StudioAssetKind =
  | "image"
  | "video"
  | "audio"
  | "font"
  | "document"
  | "other";

/**
 * A single asset entry returned by a {@link StudioAssetSource}.
 *
 * The shape is intentionally loose — concrete asset managers can add
 * fields via declaration merging. Required fields are enough for the
 * sidebar to render.
 */
export interface StudioAsset {
  readonly id: string;
  readonly kind: StudioAssetKind;
  /** Display name shown beneath the tile. */
  readonly name: string;
  /** URL the canvas inserts when the user clicks the tile. */
  readonly url: string;
  /** Optional thumbnail URL. Falls back to `url` for images. */
  readonly thumbnailUrl?: string;
  /** Optional MIME type. Used for filter accuracy when `kind` is `"other"`. */
  readonly mimeType?: string;
  /** Optional tags surfaced by the search input. */
  readonly tags?: readonly string[];
  /** Optional size in bytes — surfaced in tooltips. */
  readonly size?: number;
}

/**
 * Progress envelope emitted while an upload is in flight.
 *
 * Asset sources call the listener passed to {@link StudioAssetSource.upload}
 * (when present) with a sequence of `progress` events followed by
 * exactly one terminal `done` or `error` event.
 */
export type StudioAssetUploadEvent =
  | {
      readonly type: "progress";
      readonly bytesUploaded: number;
      readonly bytesTotal: number;
    }
  | { readonly type: "done"; readonly asset: StudioAsset }
  | { readonly type: "error"; readonly message: string };

export type StudioAssetUploadListener = (event: StudioAssetUploadEvent) => void;

/**
 * Search / filter / pagination query passed to
 * {@link StudioAssetSource.listPaginated}. Filters compose with AND
 * semantics: an asset must satisfy every supplied filter to land in
 * the page.
 */
export interface StudioAssetListQuery {
  /** Free-text query, matched against id, name, MIME prefix, tags. */
  readonly query?: string;
  /** Restrict to one or more asset kinds. */
  readonly kinds?: readonly StudioAssetKind[];
  /** Require all listed tags (AND semantics). */
  readonly tags?: readonly string[];
  /** Opaque pagination cursor returned by the previous page. */
  readonly cursor?: string;
  /** Maximum items per page. Sources may apply their own ceiling. */
  readonly limit?: number;
}

/**
 * Pagination envelope returned by {@link StudioAssetSource.listPaginated}.
 *
 * - `items` — the slice for the requested page.
 * - `total` — total matches across all pages (post-filter).
 * - `nextCursor` — opaque cursor for the next page, or `undefined`
 *   when the result set is exhausted.
 */
export interface StudioAssetListPage {
  readonly items: readonly StudioAsset[];
  readonly total: number;
  readonly nextCursor: string | undefined;
}

/**
 * Asset listing + mutation contract registered by an asset-manager
 * plugin via `ctx.registerAssetSource(source)`. The `image` sidebar
 * module reads from this surface; when no source is registered it
 * shows the `studio.module.image.pluginMissing` empty state.
 */
export interface StudioAssetSource {
  /** Return the current asset list (sync or async). */
  list(): readonly StudioAsset[] | Promise<readonly StudioAsset[]>;
  /**
   * Optional paginated / filtered listing. Remote sources override
   * this to push search and pagination to the server; the sidebar
   * falls back to {@link StudioAssetSource.list} when omitted.
   */
  listPaginated?(query: StudioAssetListQuery): Promise<StudioAssetListPage>;
  /**
   * Upload one or more files. The optional listener is fired with
   * progress envelopes if the source supports streaming progress. Pass
   * an `AbortSignal` to cancel an in-flight batch (e.g. on unmount);
   * sources that support cancellation reject with an `AbortError`.
   */
  upload(
    files: readonly File[],
    listener?: StudioAssetUploadListener,
    signal?: AbortSignal,
  ): Promise<readonly StudioAsset[]>;
  /** Optional rename. Sidebar hides the menu item when omitted. */
  rename?(assetId: string, nextName: string): Promise<void>;
  /** Optional in-place replace. */
  replace?(assetId: string, file: File): Promise<StudioAsset>;
  /** Optional tag editor. Replaces the asset's tag set in place. */
  setTags?(assetId: string, tags: readonly string[]): Promise<void>;
  /** Optional delete. */
  delete?(assetId: string): Promise<void>;
  /** Optional URL accessor for "Copy URL". Defaults to `asset.url`. */
  getUrl?(assetId: string): string | Promise<string>;
  /**
   * Optional subscription. The sidebar calls it on mount with a
   * listener that re-runs `list()` when fired.
   */
  subscribe?(listener: () => void): () => void;
  /**
   * Optional streaming upload subscription. Fired with the same
   * envelope shape `upload()` emits to its inline listener, but
   * delivered to every subscriber. Hosts use this to render
   * persistent progress UI outside the upload call site.
   */
  subscribeUploads?(listener: StudioAssetUploadListener): () => void;
}

/**
 * Plugin-contributed entry in the per-asset overflow `…` menu.
 * Built-ins (Rename, Replace, Copy URL, Delete) come from the source
 * itself; this surface lets plugins add commands like "Open in CDN".
 */
export interface StudioAssetAction {
  readonly id: string;
  /** i18n key for the menu item label. */
  readonly labelKey: string;
  /** Optional `lucide-react` icon name. */
  readonly icon?: string;
  /** Optional `"destructive"` tone for danger items. */
  readonly tone?: "default" | "destructive";
  readonly run: (input: {
    readonly asset: StudioAsset;
    // `level` mirrors `StudioLogLevel` from `./plugin.js` inline to
    // keep `types/sidebar.ts` free of imports from `plugin.ts`
    // (`plugin.ts` already imports from here — see madge gate).
    readonly log: (
      level: "debug" | "info" | "warn" | "error",
      message: string,
      meta?: Readonly<Record<string, unknown>>,
    ) => void;
  }) => void | Promise<void>;
}

// -----------------------------------------------------------------------------
// `text` module — Copywriting
// -----------------------------------------------------------------------------

/**
 * Built-in snippet categories. Plugins may extend by passing arbitrary
 * strings; the i18n catalog ships keys for `basic` / `brand` only —
 * unknown categories render under the snippet's literal category name.
 */
export type StudioCopySnippetCategory = "basic" | "brand" | (string & {});

export interface StudioCopySnippet {
  readonly id: string;
  readonly category: StudioCopySnippetCategory;
  readonly title: string;
  readonly body: string;
  readonly tags?: readonly string[];
}

/**
 * A bundle of snippets registered as a unit via
 * `ctx.registerCopySnippetPack(pack)`. Optional `locale` lets the host
 * register multiple packs and switch between them based on the active
 * locale (the v1 sidebar does not auto-switch — the host decides).
 */
export interface StudioCopySnippetPack {
  readonly id: string;
  readonly locale?: string;
  readonly snippets: readonly StudioCopySnippet[];
}

// -----------------------------------------------------------------------------
// `copilot` module — AI Copilot
// -----------------------------------------------------------------------------

/**
 * Host-supplied panel body for the sidebar's `copilot` module.
 * `@anvilkit/core` stays agnostic about any specific AI plugin — the
 * host (or an integration plugin paired with `@anvilkit/plugin-ai-copilot`)
 * registers a single panel via `ctx.registerCopilotPanel(panel)` and
 * owns its own React state, plugin reference, and dispatch wiring.
 *
 * Mirrors the {@link StudioAssetSource} shape: v1 supports a single
 * panel, last-write-wins; the module shows `studio.module.copilot.empty`
 * until a panel is registered.
 */
export interface StudioCopilotPanel {
  /**
   * Render the panel body. Called from the `copilot` module on every
   * render; the returned tree is rendered directly inside the sidebar
   * panel's body slot. The function is the React component itself —
   * implementations may close over plugin references and own their
   * internal state via standard hooks.
   */
  readonly render: () => ReactNode;
}

// -----------------------------------------------------------------------------
// `history` module — Version History
// -----------------------------------------------------------------------------

/**
 * Host-supplied panel body for the sidebar's `history` module.
 * `@anvilkit/core` stays agnostic about any specific snapshot store —
 * the host (or an integration plugin paired with
 * `@anvilkit/plugin-version-history`) registers a single panel via
 * `ctx.registerHistoryPanel(panel)` and owns its own React state,
 * adapter reference, and restore-dispatch wiring.
 *
 * Mirrors {@link StudioCopilotPanel} and {@link StudioAssetSource}: v1
 * supports a single panel, last-write-wins; the module shows
 * `studio.module.history.empty` until a panel is registered.
 */
export interface StudioHistoryPanel {
  /**
   * Render the panel body. Called from the `history` module on every
   * render; the returned tree is rendered directly inside the sidebar
   * panel's body slot. Implementations may close over an adapter
   * reference and own their internal state via standard hooks.
   */
  readonly render: () => ReactNode;
}

// -----------------------------------------------------------------------------
// Common
// -----------------------------------------------------------------------------

/**
 * Handle returned by every `register*` extension method. Calling it
 * removes the contributed entry from the registry. Plugins should
 * collect these in their `register()` body and call them in
 * `onDestroy` so a remount does not duplicate registrations.
 */
export type StudioSidebarUnregister = () => void;
