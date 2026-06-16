import type { PageRootProps, PageSeo } from "@anvilkit/schema";
import { Render } from "@puckeditor/core/rsc";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { getPage } from "../../lib/page-store";
import { demoConfig } from "../../lib/puck-demo";

interface SlugPageProps {
	readonly params: Promise<{ slug: string[] }>;
}

// The in-memory page store mutates (via /api/pages/*), so never statically
// cache — read the live store on each request.
export const dynamic = "force-dynamic";

const slugOf = (segments: string[]): string => segments.join("/");

/**
 * F6: derive Next `Metadata` from `root.props.seo` (PRD §5.5). `noIndex`
 * drives `robots.index/follow`; `canonical` → `alternates.canonical`; `ogImage`
 * → `openGraph.images`. A missing page yields empty metadata (the page body
 * calls `notFound()`).
 */
export async function generateMetadata({
	params,
}: SlugPageProps): Promise<Metadata> {
	const { slug } = await params;
	const page = getPage(slugOf(slug));
	if (page === undefined) return {};

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
 * F6: deterministic published render. Looks the page up by slug, 404s when
 * absent, emits a JSON-LD `WebPage` block, then server-renders the Puck
 * document with `<Render>` (no editor JS).
 */
export default async function SlugPage({
	params,
}: SlugPageProps): Promise<ReactElement> {
	const { slug } = await params;
	const page = getPage(slugOf(slug));
	if (page === undefined) notFound();

	const root = page.root.props as PageRootProps | undefined;
	const seo: PageSeo | undefined = root?.seo;
	const jsonLd: Record<string, string> = {
		"@context": "https://schema.org",
		"@type": "WebPage",
		name: seo?.title ?? root?.title ?? slugOf(slug),
	};
	if (seo?.description !== undefined) jsonLd.description = seo.description;
	if (seo?.canonical !== undefined) jsonLd.url = seo.canonical;

	return (
		<>
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires raw injection.
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>
			<Render config={demoConfig} data={page} />
		</>
	);
}
