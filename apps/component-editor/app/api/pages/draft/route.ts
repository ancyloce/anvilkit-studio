import { saveDraft } from "@/lib/page-storage/page-api";
import { getPageStorage } from "@/lib/page-store";

export const runtime = "nodejs";

/** `POST /api/pages/draft` — create or update a draft. */
export async function POST(req: Request): Promise<Response> {
	const storage = await getPageStorage();
	const { status, body } = await saveDraft(storage, await req.json());
	return Response.json(body, { status });
}
