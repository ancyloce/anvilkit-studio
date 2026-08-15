import { duplicatePage } from "@/lib/page-storage/page-api";
import { getPageStorage } from "@/lib/page-store";

export const runtime = "nodejs";

/** `POST /api/pages/[id]/duplicate` — clone a record under a new id+slug. */
export async function POST(
	req: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await params;
	const storage = await getPageStorage();
	const input = await req.json().catch(() => ({}));
	const { status, body } = await duplicatePage(storage, id, input);
	return Response.json(body, { status });
}
