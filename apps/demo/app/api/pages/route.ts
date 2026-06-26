import { listPages } from "@/lib/page-storage/page-api";
import { getPageStorage } from "@/lib/page-store";

export const runtime = "nodejs";

/**
 * `GET /api/pages` — list page summaries (no heavy payloads). Optional
 * `?status=draft|published|archived` and `?parentFolder=` filters.
 */
export async function GET(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const storage = await getPageStorage();
	const { status, body } = await listPages(storage, {
		status: url.searchParams.get("status") ?? undefined,
		parentFolder: url.searchParams.get("parentFolder") ?? undefined,
	});
	return Response.json(body, { status });
}
