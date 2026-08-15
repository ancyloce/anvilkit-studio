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
 * Draft preview (design 0022 §1.6). Same rendering pipeline as the
 * published route below it — one `Config`, one `Data`, one compiled
 * appearance sheet (Unified Puck Contract rule 3). The only difference is
 * which document is read: the draft rather than the published payload.
 */
export default async function PreviewPage({
	params,
}: {
	params: Promise<{ pageId: string }>;
}) {
	const { pageId } = await params;
	const storage = await getPageStorage();
	const record = await storage.getById(pageId);
	const data = record?.draft ?? record?.published;
	if (data === undefined) notFound();

	// Compiled OUTSIDE React so the render computes nothing and mutates no
	// cache (`AnvilKitRender` takes the precompiled result verbatim).
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
