/**
 * @file Shared "render a published page by slug" model.
 *
 * Both render routes — the public `app/[...slug]/page.tsx` and the editor-scoped
 * `app/puck/render/[...slug]/page.tsx` — resolve the same durable
 * {@link getPublishedPage} store, derive identical SEO metadata + JSON-LD, and
 * resolve `dataSource` directives before handing a plain document to `<Render>`.
 * Keeping that logic here means the two routes can never drift on what
 * "published" means or how SEO is derived.
 */
import type { PageRootProps, PageSeo } from "@anvilkit/schema";
import type { Metadata } from "next";
import { resolveDataSources } from "./data-source-adapter";
import type { DemoPageData } from "./page-storage/types";
import { getPublishedPage } from "./page-store";

const slugOf = (segments: string[]): string => segments.join("/");

export interface PublishedRenderModel {
	/** Document with `dataSource` directives resolved into plain props. */
	readonly resolved: DemoPageData;
	/** Schema.org `WebPage` block injected as JSON-LD. */
	readonly jsonLd: Record<string, string>;
}

/**
 * Derive Next `Metadata` from `root.props.seo`. `noIndex` drives
 * `robots.index/follow`; `canonical` → `alternates.canonical`; `ogImage` →
 * `openGraph.images`. A missing/unpublished page yields empty metadata (the
 * route body calls `notFound()`).
 */
export async function buildPublishedMetadata(
	segments: string[],
): Promise<Metadata> {
	const page = await getPublishedPage(slugOf(segments));
	if (page === null) return {};

	const root = page.root.props as PageRootProps | undefined;
	const seo: PageSeo | undefined = root?.seo;
	const title = seo?.title ?? root?.title;
	const metadata: Metadata = {
		robots: { index: !seo?.noIndex, follow: !seo?.noIndex },
	};
	const openGraph: NonNullable<Metadata["openGraph"]> = {};

	if (title !== undefined) {
		metadata.title = title;
		openGraph.title = title;
	}
	if (seo?.description !== undefined) {
		metadata.description = seo.description;
		openGraph.description = seo.description;
	}
	if (seo?.canonical !== undefined) {
		metadata.alternates = { canonical: seo.canonical };
	}
	if (seo?.ogImage !== undefined) {
		openGraph.images = [seo.ogImage];
	}
	if (Object.keys(openGraph).length > 0) {
		metadata.openGraph = openGraph;
	}
	return metadata;
}

/**
 * Resolve the document to render for `segments`, or `null` when nothing should
 * render (no record, never published, or archived) — the caller turns `null`
 * into `notFound()`. By default only the `published` payload is served.
 *
 * `opts.preview` opts into preview mode: the in-progress `draft` is served
 * instead (falling back to `published`). The editor's header Preview action uses
 * this to render the live, possibly-unsaved document it just stored as the
 * page's draft in SQLite — so the preview transports the document through the
 * durable store, not the URL. The public render routes never set it.
 */
export async function loadPublishedRender(
	segments: string[],
	opts?: { readonly preview?: boolean },
): Promise<PublishedRenderModel | null> {
	const page = await getPublishedPage(slugOf(segments), opts);
	if (page === null) return null;

	const root = page.root.props as PageRootProps | undefined;
	const seo: PageSeo | undefined = root?.seo;
	const jsonLd: Record<string, string> = {
		"@context": "https://schema.org",
		"@type": "WebPage",
		name: seo?.title ?? root?.title ?? slugOf(segments),
	};
	if (seo?.description !== undefined) jsonLd.description = seo.description;
	if (seo?.canonical !== undefined) jsonLd.url = seo.canonical;

	// Resolve `remote_csv` dataSource directives into plain props before
	// rendering — the component never fetches.
	const resolved = await resolveDataSources(page);
	return { resolved, jsonLd };
}
