import { archivePage } from "../../../../../lib/page-storage/page-api";
import { getPageStorage } from "../../../../../lib/page-store";

export const runtime = "nodejs";

interface RouteContext {
	readonly params: Promise<{ id: string }>;
}

/**
 * `POST /api/pages/:id/archive` — flip the page to `archived` so the public
 * `[...slug]` route stops serving it. The published payload is preserved.
 */
export async function POST(
	_req: Request,
	{ params }: RouteContext,
): Promise<Response> {
	const { id } = await params;
	const storage = await getPageStorage();
	const { status, body } = await archivePage(storage, id);
	return Response.json(body, { status });
}
