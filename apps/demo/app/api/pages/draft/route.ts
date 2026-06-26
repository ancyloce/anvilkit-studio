import { saveDraft } from "@/lib/page-storage/page-api";
import { getPageStorage } from "@/lib/page-store";

export const runtime = "nodejs";

/**
 * `POST /api/pages/draft` — validate `data.root.props` and persist the payload as
 * the page's `draft` (the published document is untouched). Active when the
 * client uses `NEXT_PUBLIC_USE_REMOTE_STORAGE === "true"`.
 */
export async function POST(req: Request): Promise<Response> {
	const body = await req.json().catch(() => ({}));
	const storage = await getPageStorage();
	const { status, body: responseBody } = await saveDraft(storage, body);
	return Response.json(responseBody, { status });
}
