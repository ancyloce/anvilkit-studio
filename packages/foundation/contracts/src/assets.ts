/**
 * Asset resolution types — live in their own module so `plugin.ts` and
 * `export.ts` can both reference them without a cycle.
 */

/**
 * The outcome of resolving an indirect asset reference (e.g. `asset://…`) to a
 * concrete, directly-usable location.
 */
export interface AssetResolution {
	/** The resolved asset URL — e.g. an `https:` / `data:` URL or a relative path. */
	readonly url: string;
	/**
	 * Optional resolver-supplied metadata (e.g. dimensions, MIME type,
	 * attribution). Opaque to the core — passed through to consumers verbatim.
	 */
	readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * Rewrites an asset reference to its resolved location, or returns `null` when
 * this resolver does not handle the reference.
 *
 * Resolvers are registered via the plugin context's `registerAssetResolver`
 * seam and collected into `StudioRuntime.assetResolvers` in registration
 * order. A consuming export format consults each in order and stops at the
 * first non-null result; how a format treats a reference that no resolver
 * handles is the format's own policy. May run sync or async — the pipeline
 * awaits the result.
 *
 * @param url - The raw reference to resolve (e.g. an `asset://…` URL).
 */
export type IRAssetResolver = (
	url: string,
) => Promise<AssetResolution | null> | AssetResolution | null;
