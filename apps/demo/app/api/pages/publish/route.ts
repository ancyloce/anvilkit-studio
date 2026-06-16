import type { PageRootProps } from "@anvilkit/schema";
import { validatePagePayload } from "@anvilkit/validator";
import { type DemoPageData, putPage } from "../../../../lib/page-store";

export const runtime = "nodejs";

/**
 * F7 MVP publish endpoint. Validates the payload server-side; on success writes
 * it into the live render store (`page-store`) keyed by slug, so the
 * `[...slug]` route reflects the publish. Active only when the client uses
 * `NEXT_PUBLIC_USE_REMOTE_STORAGE === "true"`.
 */
export async function POST(req: Request): Promise<Response> {
	const body = (await req.json().catch(() => ({}))) as {
		slug?: string;
		data?: DemoPageData;
	};
	const rootProps = body.data?.root?.props as PageRootProps | undefined;
	const result = validatePagePayload(rootProps);
	if (!result.valid) {
		return Response.json(
			{ ok: false, issue: result.issues[0]?.message },
			{ status: 400 },
		);
	}
	const slug = rootProps?.slug ?? body.slug ?? "";
	if (slug.length > 0 && body.data !== undefined) {
		putPage(slug, body.data);
	}
	return Response.json({ ok: true, slug });
}
