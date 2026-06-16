import type { PageRootProps } from "@anvilkit/schema";
import type { Data } from "@puckeditor/core";
import { createDemoPagesData, type DemoComponents } from "./puck-demo";

export type DemoPageData = Data<DemoComponents, PageRootProps>;

/**
 * Server-side page store (PRD 0004 F6/F7). A module-level `Map` keyed by
 * `root.props.slug`, seeded from the demo pages. The save/publish API routes
 * mutate it; the `[...slug]` render route reads it. In-memory only (the MVP
 * deviation, §8.4) — a real backend would replace this module. `localStorage`
 * saves are client-only and therefore NOT visible here.
 */
const store: Map<string, DemoPageData> = new Map(
	Object.values(createDemoPagesData())
		.map((data): [string, DemoPageData] => [data.root.props?.slug ?? "", data])
		.filter(([slug]) => slug.length > 0),
);

/** Look up a published page by slug. */
export function getPage(slug: string): DemoPageData | undefined {
	return store.get(slug);
}

/** Upsert a page (used by the `/api/pages/*` routes). */
export function putPage(slug: string, data: DemoPageData): void {
	store.set(slug, data);
}

/** All known slugs (for static params / debugging). */
export function listSlugs(): readonly string[] {
	return [...store.keys()];
}
