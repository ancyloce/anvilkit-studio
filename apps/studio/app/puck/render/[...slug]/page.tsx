// Editor-scoped dynamic render route: `/puck/render/<slug>`.
//
// Captures the catch-all `slug` segments, resolves the matching *published*
// document from the durable page store (the same store the editor publishes to
// and the public `app/[...slug]` route reads), and server-renders it with
// `<AnvilKitRender>` (PLAN-0025 §9.1) — zero editor JS, and the same unified
// compiler stylesheet as every other rendering surface. The render tree is
// wrapped in `<RenderNavigation>` so internal anchor clicks soft-navigate
// between rendered pages instead of triggering a full reload.
import { AnvilKitRender } from "@anvilkit/core/react/render";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import {
	buildPublishedMetadata,
	loadPublishedRender,
	sanitizeJsonLdForScript,
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
				// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitizeJsonLdForScript neutralizes </script> breakout.
				dangerouslySetInnerHTML={{
					__html: sanitizeJsonLdForScript(model.jsonLd),
				}}
			/>
			<RenderNavigation>
				<AnvilKitRender config={demoConfig} data={model.resolved} />
			</RenderNavigation>
		</>
	);
}
