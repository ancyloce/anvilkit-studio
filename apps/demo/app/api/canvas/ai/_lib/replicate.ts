/**
 * Shared helpers for the Canvas Studio AI-image routes (task I1-11).
 *
 * Each `route.ts` is a thin App-Router handler that maps the matching
 * `AiImageJobRequest` member (plus wire-only resolved image URLs) to a
 * Replicate model call. The real provider is gated on `REPLICATE_API_TOKEN`;
 * the demo falls back to the mock provider when it is unset (see
 * `apps/demo/lib/ai-image/provider-selection.ts`). The token is read here,
 * server-side only — it never reaches the client bundle.
 */
import Replicate from "replicate";

export type AiRouteErrorCode =
	| "PROVIDER_DISABLED"
	| "BAD_REQUEST"
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
 * Run the shared route lifecycle: token guard → JSON parse → per-op
 * `build` (validation + model mapping) → `replicate.run` → normalized
 * `{ imageUrl }`. `build` returns either a {@link ModelCall} or a
 * `BAD_REQUEST` {@link RouteError}.
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
		body = await req.json();
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
