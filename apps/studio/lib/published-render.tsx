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
import { resolveAllData } from "@puckeditor/core";
import type { Metadata } from "next";
import { resolveDataSources } from "./data-source-adapter";
import type { DemoPageData } from "./page-storage/types";
import { getPublishedPage, getPublishedPageWithId } from "./page-store";
import type { DemoComponents } from "./puck-demo";
import { demoConfig } from "./puck-demo";

const slugOf = (segments: string[]): string => segments.join("/");

export interface PublishedRenderModel {
	/** Stored page record id — for `pageId` analytics attribution. */
	readonly pageId: string;
	/**
	 * The fully resolved document (§9.2): `dataSource` directives
	 * resolved into plain props, then `resolveAllData` with the
	 * binding-resolution hooks. Routes pass exactly this value to
	 * `<AnvilKitRender>` — compiler and `<Render>` share it.
	 */
	readonly resolved: DemoPageData;
	/**
	 * Schema.org `WebPage` block. SEO fields (title/description/canonical) are
	 * author-controlled — callers MUST serialize this through
	 * {@link sanitizeJsonLdForScript}, never a bare `JSON.stringify`, before handing
	 * it to a `<script>` sink.
	 */
	readonly jsonLd: Record<string, string>;
}

/**
 * `JSON.stringify` does not HTML-escape, so a `</script>` or `<` inside
 * author-controlled SEO text would otherwise break out of the `<script>` tag
 * it's injected into and execute as markup. Unicode-escaping `<`, `>`, and
 * `&` keeps the result valid JSON (and losslessly re-parseable by JSON-LD
 * crawlers) while making that breakout impossible. Call this at the sink
 * itself (`dangerouslySetInnerHTML={{ __html: sanitizeJsonLdForScript(...) }}`),
 * not upstream, so the safety guarantee is visible right next to the danger.
 */
export function sanitizeJsonLdForScript(value: unknown): string {
	return JSON.stringify(value).replace(
		/[<>&]/g,
		(char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
	);
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
 * this to render the live, possibly-unsaved document it just stored in the
 * `__preview__` scratch record — so the preview transports the document through
 * the durable store, not the URL. The public render routes never set it.
 */
export async function loadPublishedRender(
	segments: string[],
	opts?: { readonly preview?: boolean },
): Promise<PublishedRenderModel | null> {
	const found = await getPublishedPageWithId(slugOf(segments), opts);
	if (found === null) return null;
	const { id: pageId, data: page } = found;

	const root = page.root.props as PageRootProps | undefined;
	const seo: PageSeo | undefined = root?.seo;
	const jsonLdData: Record<string, string> = {
		"@context": "https://schema.org",
		"@type": "WebPage",
		name: seo?.title ?? root?.title ?? slugOf(segments),
	};
	if (seo?.description !== undefined) jsonLdData.description = seo.description;
	if (seo?.canonical !== undefined) jsonLdData.url = seo.canonical;

	// §9.2 steps 4–5 (PLAN-0025): first the existing dataSource
	// resolution (`remote_csv` directives into plain props — the
	// component never fetches), then Puck's official `resolveAllData`,
	// which runs the binding-resolution `resolveData` hooks wired into
	// `demoConfig` (P4-04). The returned document is THE document: the
	// routes hand exactly this value to `<AnvilKitRender>`, whose
	// compiler and `<Render>` therefore can never see different data.
	const sourced = await resolveDataSources(page);
	const resolved = await resolveAllData<DemoComponents, PageRootProps>(
		sourced,
		demoConfig,
	);
	return { pageId, resolved, jsonLd: jsonLdData };
}
