// Imported at the PAGE level (not the layout) on purpose: Next emits page CSS
// after layout CSS, so this combined component sheet — where the responsive
// `md:*` utilities are correctly ordered after their base utilities — loads
// last and wins the cascade. In a layout it can be overridden by a later page
// chunk's bare `.hidden` / `.flex`, collapsing the Navbar to its mobile menu on
// desktop.
import "@/lib/component-styles.css";
import { Render } from "@puckeditor/core/rsc";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import {
	buildPublishedMetadata,
	loadPublishedRender,
} from "@/lib/published-render";
import { demoConfig } from "@/lib/puck-demo";

interface SlugPageProps {
	readonly params: Promise<{ slug: string[] }>;
}

// The page store mutates (via /api/pages/*), so never statically cache — read
// the live store on each request. Only the `published` payload is served here;
// drafts and archived pages are never rendered (see `getPublishedPage`). A
// future preview mode would opt into `getPublishedPage(slug, { preview: true })`.
export const dynamic = "force-dynamic";

/**
 * F6: derive Next `Metadata` from `root.props.seo` (PRD §5.5). Shared with the
 * editor-scoped `/puck/render/[...slug]` route via {@link buildPublishedMetadata}.
 */
export async function generateMetadata({
	params,
}: SlugPageProps): Promise<Metadata> {
	const { slug } = await params;
	return buildPublishedMetadata(slug);
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
	const model = await loadPublishedRender(slug);
	if (model === null) notFound();

	return (
		<>
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires raw injection.
				dangerouslySetInnerHTML={{ __html: JSON.stringify(model.jsonLd) }}
			/>
			<Render config={demoConfig} data={model.resolved} />
		</>
	);
}
