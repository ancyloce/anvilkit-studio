import { compileDocumentAppearance } from "@anvilkit/core/editor";
import { AnvilKitRender } from "@anvilkit/core/react/render";
import type { Config } from "@puckeditor/core";
import { notFound } from "next/navigation";
import { componentEditorConfig } from "@/lib/editor-config";
import { getPageStorage } from "@/lib/page-store";
import "@/app/globals.css";

// The page store mutates through /api/pages/*, so never statically cache.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Published render (design 0022 §1.1). Serves ONLY the published payload —
 * a draft-only or archived page 404s here, which is what keeps preview and
 * publish honestly different surfaces over the same pipeline.
 */
export default async function RenderPage({
	params,
}: {
	params: Promise<{ slug: string[] }>;
}) {
	const { slug } = await params;
	const storage = await getPageStorage();
	const record = await storage.getBySlug(slug.join("/"));
	if (record === null || record.status !== "published") notFound();

	const data = record.published;
	if (data === undefined) notFound();

	// Compiled OUTSIDE React (see the preview route).
	const compiled = compileDocumentAppearance({
		data,
		config: componentEditorConfig as Config,
	});

	return (
		<AnvilKitRender
			config={componentEditorConfig as Config}
			data={data}
			compiled={compiled}
		/>
	);
}
