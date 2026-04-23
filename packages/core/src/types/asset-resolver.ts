/**
 * Asset resolution types — live in their own module so `plugin.ts` and
 * `export.ts` can both reference them without a cycle.
 */

export interface AssetResolution {
	readonly url: string;
	readonly meta?: Readonly<Record<string, unknown>>;
}

export type IRAssetResolver = (
	url: string,
) => Promise<AssetResolution | null> | AssetResolution | null;
