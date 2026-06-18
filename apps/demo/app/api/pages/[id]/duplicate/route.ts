import { duplicatePage } from "../../../../../lib/page-storage/page-api";
import { getPageStorage } from "../../../../../lib/page-store";

export const runtime = "nodejs";

interface RouteContext {
	readonly params: Promise<{ id: string }>;
}

/**
 * `POST /api/pages/:id/duplicate` — clone a page into a fresh draft under a new
 * id and slug (`<slug>-copy` by default; override via `{ slug, title }`). 409 if
 * the target slug is taken.
 */
export async function POST(
	req: Request,
	{ params }: RouteContext,
): Promise<Response> {
	const { id } = await params;
	const body = (await req.json().catch(() => ({}))) as {
		slug?: string;
		title?: string;
	};
	const storage = await getPageStorage();
	const { status, body: responseBody } = await duplicatePage(storage, id, body);
	return Response.json(responseBody, { status });
}
