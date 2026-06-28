// The render path deliberately keeps `<Render>` from `@puckeditor/core/rsc`
// instead of importing `<Studio>` from `@anvilkit/core`. Three reasons:
//
//   1. `<Studio>` is the *editor* shell — it mounts `<Puck>`, runs the
//      plugin compile + lifecycle pipeline, and is `"use client"`. The
//      render route is a React Server Component and never needs any of
//      that machinery.
//   2. `@puckeditor/core/rsc` is the RSC-safe entry point for `Render`
//      so page rendering stays on the server and ships zero editor
//      JavaScript to the client.
//   3. Plugin lifecycle hooks (`onInit`, `onDataChange`, publish veto)
//      have no meaning on the read path — there is no editing session
//      to observe.
//
// This route renders *only* the page content:
//   - `?slug=<slug>` serves the published document from the durable store
//     (the editor's publish flow navigates here);
//   - `?slug=<slug>&preview=1` serves the page's in-progress *draft* — the
//     editor's header Preview action stores the live document to SQLite as the
//     draft, then opens this URL, so the document travels through the durable
//     store rather than being concatenated into the URL;
//   - otherwise it falls back to the shared showcase payload (`?data=` or the
//     default demo data) that backs the static "server render" links.
// No masthead, notes, links, or JSON panel — just the page.
import { Render } from "@puckeditor/core/rsc";
import type { ReactElement } from "react";
import { loadPublishedRender } from "@/lib/published-render";
import {
	demoConfig,
	demoDataSearchParam,
	getDemoDataFromSearchParam,
} from "@/lib/puck-demo";
import { RenderNavigation } from "./_components/RenderNavigation";

interface PuckRenderPageProps {
	searchParams?:
		| Promise<Record<string, string | string[] | undefined>>
		| Record<string, string | string[] | undefined>;
}

// The page store mutates (via /api/pages/*), so the `?slug=` branch must read
// the live store on each request — never statically cache.
export const dynamic = "force-dynamic";

const firstParam = (
	value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

export default async function PuckRenderPage({
	searchParams,
}: PuckRenderPageProps): Promise<ReactElement> {
	const resolvedSearchParams = searchParams ? await searchParams : undefined;
	const slug = firstParam(resolvedSearchParams?.slug);
	const preview = firstParam(resolvedSearchParams?.preview) === "1";

	// Document from the durable store, keyed by slug: the published payload, or
	// the in-progress draft under `&preview=1` (the editor's header Preview
	// action). Either way the document comes from SQLite, not the URL.
	if (slug !== undefined && slug.length > 0) {
		const model = await loadPublishedRender([slug], { preview });
		if (model !== null) {
			return (
				<RenderNavigation>
					<Render config={demoConfig} data={model.resolved} />
				</RenderNavigation>
			);
		}
	}

	// Fallback: the shared eleven-block showcase, sourced from the `?data=` param
	// (or the default demo data). Backs the static "server render" links across
	// the demo and the `button-input-smoke` E2E.
	const renderData = getDemoDataFromSearchParam(
		resolvedSearchParams?.[demoDataSearchParam],
	);
	return (
		<RenderNavigation>
			<Render config={demoConfig} data={renderData} />
		</RenderNavigation>
	);
}
