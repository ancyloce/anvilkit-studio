import { publish } from "@/lib/page-storage/page-api";
import { getPageStorage } from "@/lib/page-store";

export const runtime = "nodejs";

/** `POST /api/pages/publish` — publish a validated document. */
export async function POST(req: Request): Promise<Response> {
	const storage = await getPageStorage();
	const { status, body } = await publish(storage, await req.json());
	return Response.json(body, { status });
}
