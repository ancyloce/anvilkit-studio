import {
	asFiniteNumber,
	asInteger,
	asString,
	type ModelCall,
	runImageRoute,
} from "../_lib/replicate";

export const runtime = "nodejs";

/**
 * Image variation via SDXL img2img. Body: `AiImageVariationRequest` plus the
 * wire-only `sourceImageUrl` the client resolves from `sourceAssetId`.
 */
export function POST(req: Request): Promise<Response> {
	return runImageRoute(req, (body) => {
		const image = asString(body.sourceImageUrl);
		if (!image) {
			return {
				error: {
					code: "BAD_REQUEST",
					message: "`sourceImageUrl` is required.",
				},
			};
		}
		// SDXL requires a prompt; a variation has none, so pass an empty string
		// and lean on `prompt_strength` for the img2img blend (demo-grade).
		const input: Record<string, unknown> = {
			image,
			prompt: "",
			prompt_strength: asFiniteNumber(body.strength) ?? 0.6,
		};
		const seed = asInteger(body.seed);
		if (seed !== undefined) {
			input.seed = seed;
		}
		return { model: "stability-ai/sdxl", input } satisfies ModelCall;
	});
}
