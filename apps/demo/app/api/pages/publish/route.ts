import { publish } from "@/lib/page-storage/page-api";
import { getPageStorage } from "@/lib/page-store";

export const runtime = "nodejs";

/**
 * `POST /api/pages/publish` — validate the *complete* Puck document and, on
 * success, copy it into the page's `published` payload so the `[...slug]` route
 * serves it. Invalid payloads are rejected before any write.
 */
export async function POST(req: Request): Promise<Response> {
	const body = await req.json().catch(() => ({}));
	const storage = await getPageStorage();
	const { status, body: responseBody } = await publish(storage, body);
	return Response.json(responseBody, { status });
}
