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
 * Pages source contract. The host application supplies one of these
 * via the `<Studio>` `pages` prop. When omitted, the `layer/pages`
 * sub-panel renders the empty state keyed
 * `studio.module.layer.pages.empty`.
 *
 * `subscribe` is optional: sources backed by reactive stores wire
 * live updates by calling the listener; static fixtures can omit it
 * and rely on the sidebar's pull-on-mount semantics.
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
}
