/**
 * @file `<Studio>` Pages source contract.
 *
 * The `layer` sidebar module renders the host application's page list
 * via this source. The host owns navigation — clicking a page row
 * fires `onSelect` and the host is responsible for routing. v1 has no
 * built-in router integration; the contract is intentionally minimal
 * so any framework (Next.js App Router, Remix, custom) can adapt it.
 *
 * This is a pure type module — no runtime exports — so importing it
 * adds zero bytes to the runtime bundle.
 */

/**
 * A single page entry shown in the `layer/pages` sub-panel.
 *
 * `route` is a tagged flag, not a route string: it tells the sidebar
 * to display the globe badge keyed `studio.module.layer.pages.routeBadge`.
 * The actual URL lives on `path` and is interpreted by the host app.
 */
export interface StudioPage {
	/** Stable id, unique within the source. */
	readonly id: string;
	/** Human-readable title shown in the row. */
	readonly title: string;
	/** Optional path (e.g. `"/about"`). Required for `route=true` rows. */
	readonly path?: string;
	/**
	 * `true` if this page corresponds to a public route (gets the
	 * globe badge); `false`/omitted for non-route content (templates,
	 * drafts, etc.).
	 */
	readonly route?: boolean;
	/**
	 * `true` for the page currently loaded into the canvas. The host
	 * computes this from its routing state during {@link StudioPagesSource.list}
	 * and re-emits via `subscribe()` when the active page changes. The
	 * sidebar renders the row with the `--ak-studio-accent` background
	 * (PRD §6.2). Optional — sources that omit it always render every
	 * row inactive.
	 */
	readonly active?: boolean;
	/**
	 * Short meta/description text. Surfaced in the page settings
	 * dialog and (optionally) the SEO `<meta name="description">`
	 * fallback when {@link StudioPageSeo.metaDescription} is unset.
	 */
	readonly description?: string;
	/**
	 * Structured SEO block. When present, edited via the SEO section of
	 * the page settings dialog; when absent, the section is hidden.
	 */
	readonly seo?: StudioPageSeo;
	/**
	 * Advisory only — {@link StudioPagesSource.list} order is authoritative
	 * for rendering. Hosts may use this for their own sorting/persistence.
	 */
	readonly order?: number;
	/**
	 * `true` marks a page as non-renamable / non-deletable (e.g. `home`).
	 * Generalises the previous `isHome` heuristic — when set, rename and
	 * delete affordances are suppressed regardless of callback presence.
	 */
	readonly locked?: boolean;
}

/**
 * Input shape for {@link StudioPagesSource.onCreate}.
 *
 * Captures the `AddPageDialog` form values. `route` is optional
 * because not every page is a public route.
 */
export interface StudioPageCreateInput {
	readonly title: string;
	readonly path: string;
	readonly route?: boolean;
}

/**
 * Structured SEO metadata for a page. Every field is optional so the
 * host can surface only what it persists; the settings dialog shows the
 * full set when the source implements {@link StudioPagesSource.onUpdateSettings}.
 */
export interface StudioPageSeo {
	readonly metaTitle?: string;
	readonly metaDescription?: string;
	readonly ogImage?: string;
	readonly noindex?: boolean;
	/**
	 * Canonical URL for the page (`<link rel="canonical">`). Mirrors
	 * `root.props.seo.canonical` so the root↔sidecar projection
	 * (`pageRootSeoToStudioPageSeo` in `@anvilkit/core`) round-trips losslessly; the
	 * page-settings dialog does not edit it, so it passes through untouched.
	 */
	readonly canonical?: string;
}

/** Input shape for {@link StudioPagesSource.onRename}. */
export interface StudioPageRenameInput {
	readonly id: string;
	readonly title: string;
	readonly path?: string;
}

/** Input shape for {@link StudioPagesSource.onReorder}. */
export interface StudioPageReorderInput {
	readonly id: string;
	readonly toIndex: number;
}

/**
 * Input shape for {@link StudioPagesSource.onUpdateSettings}.
 *
 * Every editable field is optional — hosts that only persist a subset
 * (e.g. title and SEO but not `description`) simply ignore the absent
 * keys. The dialog sends only fields the user changed.
 */
export interface StudioPageSettingsInput {
	readonly id: string;
	readonly title?: string;
	readonly path?: string;
	readonly route?: boolean;
	readonly description?: string;
	readonly seo?: StudioPageSeo;
}

/**
 * Pages source contract. The host application supplies one of these
 * via the `<Studio>` `pages` prop. When omitted, the `layer/pages`
 * sub-panel renders the empty state keyed
 * `studio.module.layer.pages.empty`.
 *
 * `subscribe` is optional: sources backed by reactive stores wire
 * live updates by calling the listener; static fixtures can omit it
 * and rely on the sidebar's pull-on-mount semantics.
 *
 * ### Capability gating
 *
 * Every callback below is **optional**. The sidebar uses capability
 * detection — "is the callback defined?" — to decide whether to render
 * the matching affordance. A host that implements `onRename` gets the
 * inline rename input; a host that doesn't gets a plain row. The
 * existing `onCreate` / `subscribe?` gating is the precedent.
 *
 * ### Data-flow rule (PRD §3.3)
 *
 * **No optimistic mutation in core.** Every callback resolves → host
 * mutates its registry → host invokes the {@link subscribe} listener →
 * the panel re-runs {@link list}. The single documented exception is
 * {@link onDuplicate}: it may return the created page so the UI can
 * pre-select it before the refresh round-trips.
 */
export interface StudioPagesSource {
	/** Return the current page list. May be sync or async. */
	list(): readonly StudioPage[] | Promise<readonly StudioPage[]>;
	/**
	 * Optional subscription. When set, the sidebar calls it on mount
	 * with a listener and re-runs `list()` whenever the listener fires.
	 * Returns an `unsubscribe` cleanup.
	 */
	subscribe?(listener: () => void): () => void;
	/** Fired when a page row is clicked. Host routes to that page. */
	onSelect?(pageId: string): void;
	/**
	 * Fired when the `+` add-page dialog is submitted. Host creates
	 * the page and (optionally) navigates to it. Async result is
	 * awaited by the dialog so it can show a pending state.
	 */
	onCreate?(input: StudioPageCreateInput): void | Promise<void>;
	/**
	 * Rename / re-path a page. The inline rename affordance is hidden
	 * when this callback is undefined OR when {@link StudioPage.locked}
	 * is `true` on the target row.
	 */
	onRename?(input: StudioPageRenameInput): void | Promise<void>;
	/**
	 * Delete a page. The delete menu item + confirm dialog are hidden
	 * when this callback is undefined OR when {@link StudioPage.locked}
	 * is `true` on the target row.
	 */
	onDelete?(pageId: string): void | Promise<void>;
	/**
	 * Duplicate a page. Hidden when undefined.
	 *
	 * **Optimistic-pre-select exception (PRD §3.3):** the host may
	 * resolve with the created {@link StudioPage} so the UI can pre-
	 * select it before the standard `subscribe → list()` refresh
	 * round-trips. Returning `void` is also valid — the row simply
	 * appears once the host's `subscribe` listener fires.
	 */
	onDuplicate?(pageId: string): void | Promise<StudioPage | void>;
	/**
	 * Reorder a page to a new index. Drag handles are inert when this
	 * callback is undefined.
	 */
	onReorder?(input: StudioPageReorderInput): void | Promise<void>;
	/**
	 * Update page settings + SEO. The settings menu item is hidden
	 * when this callback is undefined; the SEO section inside the
	 * dialog follows the same gate.
	 */
	onUpdateSettings?(input: StudioPageSettingsInput): void | Promise<void>;
}
