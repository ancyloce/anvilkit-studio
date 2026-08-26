/**
 * Headless render of one page candidate, addressed by artifact reference.
 *
 * This is the surface the Page Preview Worker drives: it navigates here with
 * the reference on request headers, waits for the ready marker, and
 * screenshots. Nothing here is for a human — no navigation, no SEO, no JSON-LD
 * — because the output is evidence about a candidate, not a page being served.
 *
 * It renders through `<AnvilKitRender>` and `resolveDocument`, the same
 * component and the same resolution the published route uses. That is the
 * point: a preview produced by a second rendering path would be evidence about
 * that path, not about what publishing will do.
 *
 * A refusal renders a marker instead of a page, so the worker can record *why*
 * nothing was rendered. A blank screenshot and a refused one must never look
 * alike.
 */
import { AnvilKitRender } from "@anvilkit/core/react/render";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import {
	type ArtifactRenderRefusal,
	artifactRenderEnabled,
	loadArtifactRender,
	readArtifactReference,
} from "@/lib/artifact-render";
import { demoConfig } from "@/lib/puck-demo";

// The document comes from the request, so there is nothing to cache and
// caching it would serve one candidate's render for another's reference.
export const dynamic = "force-dynamic";
// `node:crypto` verifies the digest, so this cannot run on the edge runtime.
export const runtime = "nodejs";

/** Attributes the worker keys on. Both stable; neither is decorative. */
const READY_ATTRIBUTE = "data-anvilkit-preview-ready";
const REFUSED_ATTRIBUTE = "data-anvilkit-preview-refused";

function Refused({
	refusal,
}: {
	readonly refusal: ArtifactRenderRefusal;
}): ReactElement {
	// The reason is an enum value, never the underlying error: refusals travel
	// into a durable result the reviewer reads, and an internal message could
	// carry a host, a path, or a signed URL.
	return <div {...{ [REFUSED_ATTRIBUTE]: refusal }} />;
}

export default async function ArtifactRenderPage(): Promise<ReactElement> {
	// An unconfigured deployment does not have this route at all, rather than
	// having one that answers "forbidden" — the difference matters when the app
	// is also the public product.
	if (!artifactRenderEnabled()) notFound();

	const reference = readArtifactReference(await headers());
	if (reference === null) return <Refused refusal="malformed-reference" />;

	const outcome = await loadArtifactRender(reference);
	if (!outcome.ok) return <Refused refusal={outcome.refusal} />;

	// The marker goes on a wrapper rather than the document root so the
	// screenshot's subject is untouched: the worker waits for this, then
	// captures the rendered document inside it.
	return (
		<div {...{ [READY_ATTRIBUTE]: reference.digest }}>
			<AnvilKitRender config={demoConfig} data={outcome.document} />
		</div>
	);
}
