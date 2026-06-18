import { deletePage, getPage } from "../../../../lib/page-storage/page-api";
import { getPageStorage } from "../../../../lib/page-store";

export const runtime = "nodejs";

interface RouteContext {
	readonly params: Promise<{ id: string }>;
}

/** `GET /api/pages/:id` — resolves by id, falling back to slug. */
export async function GET(
	_req: Request,
	{ params }: RouteContext,
): Promise<Response> {
	const { id } = await params;
	const storage = await getPageStorage();
	const { status, body } = await getPage(storage, id);
	return Response.json(body, { status });
}

/** `DELETE /api/pages/:id` — hard-delete the record. */
export async function DELETE(
	_req: Request,
	{ params }: RouteContext,
): Promise<Response> {
	const { id } = await params;
	const storage = await getPageStorage();
	const { status, body } = await deletePage(storage, id);
	return Response.json(body, { status });
}
