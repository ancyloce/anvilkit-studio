import {
	errorEnvelope,
	notConfigured,
	PlatformError,
	platformFetch,
	platformFromEnv,
	relay,
	unreachable,
	uploadArtifact,
} from "@/lib/agent/platform";
import {
	byteLength,
	PROMPT_MAX_BYTES,
	type PreparationRequest,
} from "@/lib/agent/preparation-client";

export const runtime = "nodejs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$/;

function valid(body: unknown): body is PreparationRequest {
	if (typeof body !== "object" || body === null) return false;
	const b = body as Record<string, unknown>;
	const refs = (v: unknown) =>
		v === undefined ||
		(Array.isArray(v) &&
			v.length <= 64 &&
			v.every(
				(r) =>
					typeof r === "object" &&
					r !== null &&
					typeof r.sourceId === "string" &&
					typeof r.revision === "string",
			));
	return (
		typeof b.commandId === "string" &&
		ID.test(b.commandId) &&
		typeof b.prompt === "string" &&
		b.prompt.trim() !== "" &&
		byteLength(b.prompt) <= PROMPT_MAX_BYTES &&
		refs(b.brandReferences) &&
		refs(b.assetReferences)
	);
}

/**
 * `POST /api/agent/preparations` — uploads the prompt as a `prompt`
 * artifact (text/plain; command ids derived from the caller's, so a retry
 * resolves to the same transfer) and submits `POST /api/v1/preparations`
 * bound to that transfer and digest. The Agent API's answer is relayed as is;
 * the same commandId and prompt return the original operation.
 */
export async function POST(req: Request): Promise<Response> {
	const body: unknown = await req.json().catch(() => null);
	if (!valid(body)) {
		return errorEnvelope(
			400,
			"INVALID_ARGUMENT",
			"The body must carry a commandId and a non-empty prompt within bounds.",
			false,
		);
	}
	const config = platformFromEnv();
	if (!config) return notConfigured();
	try {
		const prompt = await uploadArtifact(config, {
			commandId: body.commandId,
			class: "prompt",
			mediaType: "text/plain; charset=utf-8",
			bytes: new TextEncoder().encode(body.prompt.trim()),
			signal: req.signal,
		});
		const request: Record<string, unknown> = {
			commandId: body.commandId,
			prompt: { transferId: prompt.transferId, digest: prompt.digest },
		};
		if (body.brandReferences?.length)
			request.brandReferences = body.brandReferences;
		if (body.assetReferences?.length)
			request.assetReferences = body.assetReferences;
		return relay(
			await platformFetch(config, "POST", "preparations", {
				json: request,
				signal: req.signal,
			}),
		);
	} catch (err) {
		if (err instanceof PlatformError) return relay(err.response);
		return unreachable();
	}
}
