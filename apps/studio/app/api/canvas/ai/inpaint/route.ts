import {
	asInteger,
	asString,
	type ModelCall,
	runImageRoute,
} from "../_lib/replicate";

export const runtime = "nodejs";

/**
 * Inpaint via stable-diffusion-inpainting. Body: `AiImageInpaintRequest` plus
 * the wire-only `sourceImageUrl` / `maskImageUrl` the client resolves from
 * `sourceAssetId` / `maskAssetId`.
 */
export function POST(req: Request): Promise<Response> {
	return runImageRoute(req, (body) => {
		const image = asString(body.sourceImageUrl);
		const mask = asString(body.maskImageUrl);
		const prompt = asString(body.prompt);
		if (!image || !mask || !prompt) {
			return {
				error: {
					code: "BAD_REQUEST",
					message:
						"`sourceImageUrl`, `maskImageUrl`, and `prompt` are required.",
				},
			};
		}
		const input: Record<string, unknown> = { image, mask, prompt };
		const seed = asInteger(body.seed);
		if (seed !== undefined) {
			input.seed = seed;
		}
		return {
			model: "stability-ai/stable-diffusion-inpainting",
			input,
		} satisfies ModelCall;
	});
}
