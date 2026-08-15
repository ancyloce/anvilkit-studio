import { deletePage, getPage } from "@/lib/page-storage/page-api";
import { getPageStorage } from "@/lib/page-store";

export const runtime = "nodejs";

/** `GET /api/pages/[id]` — fetch one record by id. */
export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await params;
	const storage = await getPageStorage();
	const { status, body } = await getPage(storage, id);
	return Response.json(body, { status });
}

/** `DELETE /api/pages/[id]` — remove a record. */
export async function DELETE(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await params;
	const storage = await getPageStorage();
	const { status, body } = await deletePage(storage, id);
	return Response.json(body, { status });
}
