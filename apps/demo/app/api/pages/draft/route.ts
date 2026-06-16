import { validatePagePayload } from "@anvilkit/validator";

export const runtime = "nodejs";

/**
 * F7 MVP draft endpoint. Validates the payload server-side and acknowledges —
 * drafts are not promoted to the live render store (only publish is). Active
 * only when the client uses `NEXT_PUBLIC_USE_REMOTE_STORAGE === "true"`.
 */
export async function POST(req: Request): Promise<Response> {
	const body = (await req.json().catch(() => ({}))) as {
		slug?: string;
		data?: { root?: { props?: unknown } };
	};
	const result = validatePagePayload(body.data?.root?.props);
	if (!result.valid) {
		return Response.json(
			{ ok: false, issue: result.issues[0]?.message },
			{ status: 400 },
		);
	}
	return Response.json({ ok: true, slug: body.slug });
}
