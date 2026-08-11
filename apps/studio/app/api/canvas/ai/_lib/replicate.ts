/**
 * Shared helpers for the Canvas Studio AI-image routes (task I1-11).
 *
 * Each `route.ts` is a thin App-Router handler that maps the matching
 * `AiImageJobRequest` member (plus wire-only resolved image URLs) to a
 * Replicate model call. The real provider is gated on `REPLICATE_API_TOKEN`;
 * the demo falls back to the mock provider when it is unset (see
 * `apps/studio/lib/ai-image/provider-selection.ts`). The token is read here,
 * server-side only — it never reaches the client bundle.
 *
 * Every route shares one request-size cap ({@link MAX_REQUEST_BODY_BYTES}),
 * enforced in {@link runImageRoute} before the body is buffered (task
 * `cp5-R01`).
 */
import Replicate from "replicate";

export type AiRouteErrorCode =
	| "PROVIDER_DISABLED"
	| "BAD_REQUEST"
	| "PAYLOAD_TOO_LARGE"
	| "PROVIDER_ERROR";

export interface AiRouteErrorBody {
	error: { code: AiRouteErrorCode; message: string };
}

/** Success body: a single image URL the client assetizes via the registry. */
export interface AiRouteSuccessBody {
	imageUrl: string;
}

/** A resolved Replicate model invocation. */
export interface ModelCall {
	model: `${string}/${string}` | `${string}/${string}:${string}`;
	input: Record<string, unknown>;
}

interface RouteError {
	error: { code: "BAD_REQUEST"; message: string };
}

/** Server-only. The configured Replicate token, or `null` when unset. */
export function readReplicateToken(): string | null {
	return process.env.REPLICATE_API_TOKEN ?? null;
}

/**
 * `useFileOutput: false` makes `run()` resolve to plain URL strings (or
 * arrays of them) rather than `FileOutput` objects, so {@link toImageUrl}
 * stays simple.
 */
export function getReplicateClient(token: string): Replicate {
	return new Replicate({ auth: token, useFileOutput: false });
}

export function errorResponse(
	status: number,
	code: AiRouteErrorCode,
	message: string,
): Response {
	return Response.json(
		{ error: { code, message } } satisfies AiRouteErrorBody,
		{
			status,
		},
	);
}

/**
 * Maximum request body every AI-image route will accept, in bytes (8 MiB).
 *
 * **Why a cap at all.** The routes are unauthenticated and unthrottled (ADR
 * 0009 Decision 3), and {@link runImageRoute} used to hand an unbounded body
 * straight to `req.json()`. The per-op `build` callbacks validate *shape*
 * (`asString` / `asInteger`), never *size*, so a single request could buffer
 * arbitrary bytes into the process before any validation ran.
 *
 * **Why 8 MiB.** These routes carry image *references*, not multipart
 * uploads — but in this app a reference is usually a `data:` URL:
 * `getAssetUrl` reads the in-memory registry
 * (`app/studio/canvas/[pageId]/CanvasStudioClient.tsx:109-112`) fed by
 * `dataUrlUploader({ maxBytes: 25_000_000 })` (`:104-108`), and base64
 * inflates the raw file ~4/3 (documented at
 * `plugin-asset-manager/src/adapters/data-url.ts:8-13`). So a body is a few
 * hundred bytes of prompt/number fields plus one `sourceImageUrl`
 * (`bg-remove`, `upscale`, `variation`) or two (`inpaint` adds
 * `maskImageUrl`). 8 MiB admits ~6.3 MB of raw image once encoded — well
 * above anything the shipped UI produces (a canvas-exported mask is a small
 * PNG; `text-to-image` is prompt-only and under a kilobyte) and far below
 * the ~67 MB two 25 MB data URLs could theoretically reach. That ceiling
 * comes from an adapter documented as dev-only ("Not for production",
 * `data-url.ts:20-23`); it is not a size this endpoint should buffer, let
 * alone forward to a paid upstream. Raising the uploader's `maxBytes` means
 * revisiting this number too.
 *
 * **What it does not do.** It bounds per-*request* cost only. The routes stay
 * unauthenticated and unthrottled, so this is no defence against request
 * *volume* — see `.env.example` and ADR 0009 Follow-up F-2.
 */
export const MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024;

/** Over-cap rejection, in the same error vocabulary as every other route error. */
function payloadTooLargeResponse(): Response {
	return errorResponse(
		413,
		"PAYLOAD_TOO_LARGE",
		`Request body exceeds the ${MAX_REQUEST_BODY_BYTES}-byte limit. Send a smaller image, or reference it by URL instead of inlining it as a data URL.`,
	);
}

type CappedBodyRead = { text: string } | { response: Response };

/**
 * Read the request body as text without ever holding more than
 * {@link MAX_REQUEST_BODY_BYTES} (plus the chunk that crosses it) in memory.
 *
 * Two guards, because neither is sufficient alone:
 *
 * 1. **`Content-Length`**, when present, rejects an oversized upload before a
 *    single byte of it is read.
 * 2. **The streamed read**, which is what actually enforces the cap. A client
 *    may omit `Content-Length` entirely (a chunked body has none) or simply
 *    understate it, so the header is a hint, not a bound. The reader meters
 *    the running total and cancels the stream the moment it crosses the cap:
 *    the remainder is never pulled, never decoded, and never buffered.
 *
 * Returns either the body text or the `413` to send back. Read failures
 * propagate to the caller, which maps them onto the same `400` an
 * unparseable body has always produced.
 */
async function readCappedBodyText(req: Request): Promise<CappedBodyRead> {
	const declared = req.headers.get("content-length");
	if (declared !== null) {
		const length = Number(declared);
		if (Number.isFinite(length) && length > MAX_REQUEST_BODY_BYTES) {
			return { response: payloadTooLargeResponse() };
		}
	}

	const stream = req.body;
	if (stream === null) {
		// Nothing to meter: an empty body, or a runtime that exposes no stream.
		// `text()` can then only return what the header check already allowed.
		return { text: await req.text() };
	}

	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let received = 0;
	let text = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		received += value.byteLength;
		if (received > MAX_REQUEST_BODY_BYTES) {
			await reader.cancel();
			return { response: payloadTooLargeResponse() };
		}
		text += decoder.decode(value, { stream: true });
	}
	return { text: text + decoder.decode() };
}

/** Normalize a Replicate `run()` output to a single image URL string. */
export function toImageUrl(output: unknown): string | null {
	const first = Array.isArray(output) ? output[0] : output;
	if (typeof first === "string") {
		return first;
	}
	if (first && typeof first === "object") {
		const candidate = first as { url?: unknown };
		if (typeof candidate.url === "function") {
			const value = (candidate.url as () => unknown)();
			if (value instanceof URL) {
				return value.toString();
			}
			return typeof value === "string" ? value : null;
		}
		if (typeof candidate.url === "string") {
			return candidate.url;
		}
	}
	return null;
}

/** Read a trimmed, non-empty string field, or `null`. */
export function asString(value: unknown): string | null {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Read a finite number field, or `undefined`. */
export function asFiniteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

/** Read an integer field, or `undefined`. */
export function asInteger(value: unknown): number | undefined {
	return typeof value === "number" && Number.isInteger(value)
		? value
		: undefined;
}

/**
 * Run the shared route lifecycle: token guard → size-capped body read →
 * JSON parse → per-op `build` (validation + model mapping) →
 * `replicate.run` → normalized `{ imageUrl }`. `build` returns either a
 * {@link ModelCall} or a `BAD_REQUEST` {@link RouteError}.
 *
 * Every route funnels through here, so the {@link MAX_REQUEST_BODY_BYTES}
 * cap applies to all of them — including any route added later, which
 * inherits it without opting in. Do not add a per-route cap.
 */
export async function runImageRoute(
	req: Request,
	build: (body: Record<string, unknown>) => ModelCall | RouteError,
): Promise<Response> {
	const token = readReplicateToken();
	if (!token) {
		return errorResponse(
			503,
			"PROVIDER_DISABLED",
			"REPLICATE_API_TOKEN is not configured on the server. Set it (and NEXT_PUBLIC_AI_IMAGE_REAL=1) to enable the real provider; the demo uses the mock provider otherwise.",
		);
	}

	let body: unknown;
	try {
		// Never `req.json()`: it buffers the whole body before anything can
		// reject it. `readCappedBodyText` meters the stream instead.
		const read = await readCappedBodyText(req);
		if ("response" in read) {
			return read.response;
		}
		body = JSON.parse(read.text);
	} catch {
		return errorResponse(
			400,
			"BAD_REQUEST",
			"Request body must be valid JSON.",
		);
	}
	if (typeof body !== "object" || body === null) {
		return errorResponse(
			400,
			"BAD_REQUEST",
			"Request body must be a JSON object.",
		);
	}

	const built = build(body as Record<string, unknown>);
	if ("error" in built) {
		return errorResponse(400, built.error.code, built.error.message);
	}

	try {
		const client = getReplicateClient(token);
		const output = await client.run(built.model, {
			input: built.input,
			signal: req.signal,
		});
		const imageUrl = toImageUrl(output);
		if (!imageUrl) {
			return errorResponse(
				500,
				"PROVIDER_ERROR",
				"Replicate returned no image output.",
			);
		}
		return Response.json({ imageUrl } satisfies AiRouteSuccessBody);
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Replicate request failed.";
		return errorResponse(500, "PROVIDER_ERROR", message);
	}
}
