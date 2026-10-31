import {
	errorEnvelope,
	forwardable,
	notConfigured,
	platformFetch,
	platformFromEnv,
	relay,
	unreachable,
} from "@/lib/agent/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;
const QUERY_KEYS = new Set([
	"after",
	"cursor",
	"limit",
	"state",
	"subjectType",
	"subjectId",
]);

/**
 * `/api/agent/v1/<path>` — forwards one request of the Agent API contract to
 * `/api/v1/<path>` with the server-held credential and relays the answer as
 * is (status, JSON or bytes, error envelope, SSE stream). Only the contract's
 * paths and methods are forwarded; the browser never sees a credential or a
 * transfer capability.
 */
async function forward(
	req: Request,
	params: Promise<{ path: string[] }>,
): Promise<Response> {
	const { path } = await params;
	const joined = path.join("/");
	if (!forwardable(joined, req.method)) {
		return errorEnvelope(404, "NOT_FOUND", "No such Agent API route.", false);
	}
	const config = platformFromEnv();
	if (!config) return notConfigured();
	const url = new URL(req.url);
	const query = new URLSearchParams();
	for (const [k, v] of url.searchParams)
		if (QUERY_KEYS.has(k)) query.append(k, v);
	// The segments passed `forwardable` (letters, digits, `._:-` only), so they
	// go out verbatim: the Agent API validates `sha256:<hex>` literally and
	// refuses a percent-encoded colon.
	const target = query.size > 0 ? `${joined}?${query}` : joined;
	const headers: Record<string, string> = {};
	const lastEventId = req.headers.get("last-event-id");
	if (lastEventId && /^(0|[1-9][0-9]{0,19})$/.test(lastEventId))
		headers["Last-Event-ID"] = lastEventId;
	const accept = req.headers.get("accept");
	if (accept) headers.Accept = accept;
	let body: ArrayBuffer | undefined;
	if (req.method !== "GET") {
		const bytes = await req.arrayBuffer();
		if (bytes.byteLength > MAX_BODY_BYTES) {
			return errorEnvelope(
				400,
				"INVALID_ARGUMENT",
				"The request body is too large.",
				false,
			);
		}
		if (bytes.byteLength > 0) {
			body = bytes;
			headers["Content-Type"] = "application/json";
		}
	}
	try {
		return relay(
			await platformFetch(config, req.method, target, {
				body,
				headers,
				signal: req.signal,
			}),
		);
	} catch {
		return unreachable();
	}
}

type Context = { params: Promise<{ path: string[] }> };

export const GET = (req: Request, ctx: Context) => forward(req, ctx.params);
export const POST = (req: Request, ctx: Context) => forward(req, ctx.params);
export const PUT = (req: Request, ctx: Context) => forward(req, ctx.params);
export const DELETE = (req: Request, ctx: Context) => forward(req, ctx.params);
