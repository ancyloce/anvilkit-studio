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

import type {
	PuckApi,
	ComponentData as PuckComponentData,
} from "@puckeditor/core";
import type { ReactNode } from "react";
// Leaf module (imports nothing), so referencing the shared union here does
// not re-form the `plugin.ts` ↔ `sidebar.ts` madge cycle.
import type { StudioLogLevel } from "./log.js";
// `pages.js` is a pure type module with zero imports, so this edge is
// one-way (sidebar → pages) and introduces no madge cycle.
import type { StudioPageSeo } from "./pages.js";

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
 * A folder returned by a folder-aware {@link StudioAssetSource} (PRD 0002 §7).
 * `parentId: null` is the root convention. Counts/timestamps are optional so a
 * source can supply a lightweight folder for the tree without them.
 */
export interface StudioAssetFolder {
	readonly id: string;
	readonly name: string;
	readonly parentId: string | null;
	readonly createdAt?: number;
	readonly updatedAt?: number;
	readonly counts?: {
		readonly assets: number;
		readonly folders: number;
	};
	readonly meta?: Readonly<Record<string, string | number | boolean>>;
}

/** A browse theme (e.g. an Unsplash topic) exposed by a themed source. `label` is an i18n key. */
export interface StudioAssetTheme {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
}

/** Sort axis for {@link StudioAssetListQuery}. */
export interface StudioAssetSort {
	readonly field: "recent" | "name" | "size" | "kind" | "relevance";
	readonly direction?: "asc" | "desc";
}

/**
 * Loading / mutation status streamed by a source via
 * {@link StudioAssetSource.subscribeStatus}. The error variant carries a
 * structural error (no class dependency on a plugin).
 */
export type StudioAssetSourceStatus =
	| { readonly phase: "idle" }
	| { readonly phase: "loading" }
	| { readonly phase: "paginating"; readonly loaded: number }
	| { readonly phase: "mutating"; readonly op: string; readonly id: string }
	| {
			readonly phase: "error";
			readonly error: {
				readonly message: string;
				readonly code?: string;
				readonly retryable?: boolean;
			};
	  };

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
	/** Optional owning folder (PRD 0002 §7). `null`/absent ⇒ root. */
	readonly folderId?: string | null;
	/** Optional provenance — which source produced it (e.g. `"local"` | `"unsplash"`). */
	readonly source?: string;
	/** Visible attribution for credit-requiring sources (Unsplash). Shown on the tile. */
	readonly attribution?: {
		readonly photographerName: string;
		readonly photographerUrl: string;
		readonly sourceUrl: string;
	};
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
	/** Scope to a folder. `null` = root only; `undefined` = any folder. */
	readonly folderId?: string | null;
	/** Include assets in descendant folders. */
	readonly recursive?: boolean;
	/** Restrict to one or more source ids. `undefined` = federate all. */
	readonly sources?: readonly string[];
	/** Host facet selections, keyed by facet id. */
	readonly facets?: Readonly<Record<string, readonly string[]>>;
	/** Sort axis. */
	readonly sort?: StudioAssetSort;
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
	/** Child folders of `query.folderId` (folder-aware sources). */
	readonly folders?: readonly StudioAssetFolder[];
	/** Root → … → current folder, for the breadcrumb. */
	readonly folderPath?: readonly StudioAssetFolder[];
	/** Per-source page tokens for federated paging, keyed by source id. */
	readonly sourceCursors?: Readonly<Record<string, string | undefined>>;
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

	// ── Folder surface (PRD 0002 §7) — all optional; a flat source omits them ──
	/** Create a folder under `parentId` (`null` ⇒ root). */
	createFolder?(
		parentId: string | null,
		name: string,
	): Promise<StudioAssetFolder>;
	renameFolder?(id: string, name: string): Promise<StudioAssetFolder>;
	removeFolder?(
		id: string,
		opts?: { readonly cascade?: boolean },
	): Promise<void>;
	moveFolder?(id: string, parentId: string | null): Promise<StudioAssetFolder>;
	/** Move an asset into a folder (`null` ⇒ root). */
	moveAsset?(assetId: string, folderId: string | null): Promise<void>;

	// ── External-source surface (PRD 0002 §8) ──
	/** Browse themes for a themed source (e.g. Unsplash topics). */
	listThemes?():
		| readonly StudioAssetTheme[]
		| Promise<readonly StudioAssetTheme[]>;
	/**
	 * Materialize an external browse result into the catalog — registers it and
	 * fires any required download trigger (Unsplash) — returning the insertable
	 * asset whose `url` now resolves. Local assets need no pick.
	 */
	pickResult?(asset: StudioAsset): Promise<StudioAsset>;
	/** Subscribe to loading/mutation status (sync sources emit only `idle`). */
	subscribeStatus?(
		listener: (status: StudioAssetSourceStatus) => void,
	): () => void;
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
		readonly log: (
			level: StudioLogLevel,
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
// `design-system` module — Design System
// -----------------------------------------------------------------------------

/**
 * Host-supplied panel body for the sidebar's `design-system` module.
 * `@anvilkit/core` stays agnostic about any specific token vocabulary —
 * the host (or an integration plugin paired with
 * `@anvilkit/plugin-design-system`) registers a single panel via
 * `ctx.registerDesignSystemPanel(panel)` and owns its own React state,
 * token tree, and theme-toggle wiring.
 *
 * Mirrors {@link StudioCopilotPanel} and {@link StudioHistoryPanel}:
 * v1 supports a single panel, last-write-wins; the module shows
 * `studio.module.designSystem.empty` until a panel is registered.
 */
export interface StudioDesignSystemPanel {
	/**
	 * Render the panel body. Called from the `design-system` module on
	 * every render; the returned tree is rendered directly inside the
	 * sidebar panel's body slot. Implementations may close over a
	 * resolved token tree and own their internal state via standard
	 * hooks.
	 */
	readonly render: () => ReactNode;
}

/**
 * Host-registered SEO panel (PRD 0004 F5). Mirrors
 * {@link StudioDesignSystemPanel}: a single panel, last-write-wins; the `seo`
 * module shows `studio.module.seo.empty` until a panel is registered. The
 * plugin's panel edits the page's `root.props.seo` via an immutable Puck
 * dispatch.
 */
export interface StudioSeoPanel {
	readonly render: () => ReactNode;
}

// -----------------------------------------------------------------------------
// `layer` module — page-settings SEO fields
// -----------------------------------------------------------------------------

/**
 * Props core's page-settings dialog passes to
 * {@link StudioPageSettingsSeoFields.render}. The dialog owns the form
 * state, the change diff, and the `onUpdateSettings` submission; the
 * plugin owns only the field UI. `value` is the page row's current SEO
 * sub-block (controlled); `onChange` replaces it wholesale with the next
 * snapshot.
 */
export interface StudioPageSettingsSeoFieldsProps {
	/** The page row's current SEO values (controlled). */
	readonly value: StudioPageSeo;
	/** Replace the SEO values with the next snapshot. */
	readonly onChange: (next: StudioPageSeo) => void;
}

/**
 * Host-registered SEO field group for the `layer` module's page-settings
 * dialog. Unlike {@link StudioSeoPanel} — which edits the *active* Puck
 * doc's `root.props.seo` via `usePuck()` — this seam edits *any* page
 * row's stored SEO through core's controlled `value`/`onChange` props, so
 * the SEO-specific field UI lives in `@anvilkit/plugin-page-seo` rather
 * than core chrome. Single-occupancy, last-write-wins; when no plugin is
 * registered the dialog renders no SEO section at all.
 */
export interface StudioPageSettingsSeoFields {
	readonly render: (props: StudioPageSettingsSeoFieldsProps) => ReactNode;
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
