import { deletePage, getPage } from "@/lib/page-storage/page-api";
import { getPageStorage } from "@/lib/page-store";

export const runtime = "nodejs";

interface RouteContext {
	readonly params: Promise<{ id: string }>;
}

/** `GET /api/pages/:id` — resolves by id, falling back to slug. */
export async function GET(
	_req: Request,
	{ params }: RouteContext,
): Promise<Response> {
	const [{ id }, storage] = await Promise.all([params, getPageStorage()]);
	const { status, body } = await getPage(storage, id);
	return Response.json(body, { status });
}

/**
 * `DELETE /api/pages/:id` — hard-delete the record. `?expectedPageRevision=`
 * makes it conditional on the revision the caller last read (409 when stale).
 */
export async function DELETE(
	req: Request,
	{ params }: RouteContext,
): Promise<Response> {
	const [{ id }, storage] = await Promise.all([params, getPageStorage()]);
	const raw = new URL(req.url).searchParams.get("expectedPageRevision");
	const expectedPageRevision =
		raw === null ? undefined : /^\d{1,15}$/.test(raw) ? Number(raw) : raw;
	const { status, body } = await deletePage(storage, id, expectedPageRevision);
	return Response.json(body, { status });
}
