// Editor-scoped dynamic render route: `/puck/render/<slug>`.
//
// Captures the catch-all `slug` segments, resolves the matching *published*
// document from the durable page store (the same store the editor publishes to
// and the public `app/[...slug]` route reads), and server-renders it with
// `<Render>` from `@puckeditor/core/rsc` — zero editor JS. The render tree is
// wrapped in `<RenderNavigation>` so internal anchor clicks soft-navigate
// between rendered pages instead of triggering a full reload.
import { Render } from "@puckeditor/core/rsc";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import {
	buildPublishedMetadata,
	loadPublishedRender,
} from "@/lib/published-render";
import { demoConfig } from "@/lib/puck-demo";
import { RenderNavigation } from "../_components/RenderNavigation";

interface PuckSlugRenderPageProps {
	readonly params: Promise<{ slug: string[] }>;
}

// The page store mutates (via /api/pages/*), so never statically cache — read
// the live store on each request.
export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: PuckSlugRenderPageProps): Promise<Metadata> {
	const { slug } = await params;
	return buildPublishedMetadata(slug);
}

export default async function PuckSlugRenderPage({
	params,
}: PuckSlugRenderPageProps): Promise<ReactElement> {
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
			<RenderNavigation>
				<Render config={demoConfig} data={model.resolved} />
			</RenderNavigation>
		</>
	);
}
