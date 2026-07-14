import { publish } from "@/lib/page-storage/page-api";
import { getPageStorage } from "@/lib/page-store";

export const runtime = "nodejs";

/**
 * `POST /api/pages/publish` — validate the *complete* Puck document and, on
 * success, copy it into the page's `published` payload so the `[...slug]` route
 * serves it. Invalid payloads are rejected before any write.
 *
 * On a successful (`200`) publish, `publish()` also records a server-side
 * `page_published` audit event (`server_side: true`) into the analytics store —
 * the factual fallback to the editor's client-side behavioral event. A
 * validation/storage failure writes nothing.
 */
export async function POST(req: Request): Promise<Response> {
	const [body, storage] = await Promise.all([
		req.json().catch(() => ({})),
		getPageStorage(),
	]);
	const { status, body: responseBody } = await publish(storage, body);
	return Response.json(responseBody, { status });
}
