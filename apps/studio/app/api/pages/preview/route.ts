import { PREVIEW_SLOT_SLUG } from "@/lib/page-link";
import { API_ERROR, apiFailure, apiSuccess } from "@/lib/page-storage/response";
import type { DemoPageData } from "@/lib/page-storage/types";
import { getPageStorage } from "@/lib/page-store";

export const runtime = "nodejs";

/**
 * `POST /api/pages/preview` — store the live editor document in the durable
 * store's single `__preview__` scratch slot (as a draft record), so the header
 * Preview action can render it via `/puck/render?slug=__preview__&preview=1`
 * without serializing the document into the URL. EVERY preview lands here, a
 * slugged page included, so previewing never overwrites a real page's saved
 * draft.
 *
 * Unlike `POST /api/pages/draft` this intentionally bypasses the strict
 * page-payload validation: a preview is throwaway and is routinely incomplete
 * (no slug yet, or a Slug root field typed but not yet slugified — both of which
 * the canonical `PageRootSchema` rejects). The
 * scratch record is a draft with no `published` payload, so it never resolves
 * on the public `/<slug>` route — only the editor's `&preview=1` render reads
 * it. Each preview overwrites the same slot.
 */
export async function POST(req: Request): Promise<Response> {
	const body = (await req.json().catch(() => null)) as {
		data?: unknown;
	} | null;
	const data = body?.data;
	if (data === null || typeof data !== "object") {
		return Response.json(
			apiFailure(API_ERROR.badRequest, "Missing preview document."),
			{ status: 400 },
		);
	}

	const storage = await getPageStorage();
	await storage.saveDraft({
		id: PREVIEW_SLOT_SLUG,
		slug: PREVIEW_SLOT_SLUG,
		data: data as DemoPageData,
	});
	return Response.json(apiSuccess(null), { status: 200 });
}
