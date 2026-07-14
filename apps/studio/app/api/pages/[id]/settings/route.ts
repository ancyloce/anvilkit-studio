import { updateSettings } from "@/lib/page-storage/page-api";
import { getPageStorage } from "@/lib/page-store";

export const runtime = "nodejs";

interface RouteContext {
	readonly params: Promise<{ id: string }>;
}

/**
 * `PATCH /api/pages/:id/settings` — validate the page's `root.props` and apply
 * them (title/slug/status/version + SEO) to the record and its payloads. Rejects
 * invalid metadata before any write.
 */
export async function PATCH(
	req: Request,
	{ params }: RouteContext,
): Promise<Response> {
	const [{ id }, body, storage] = await Promise.all([
		params,
		req.json().catch(() => ({})),
		getPageStorage(),
	]);
	const { status, body: responseBody } = await updateSettings(
		storage,
		id,
		body,
	);
	return Response.json(responseBody, { status });
}
