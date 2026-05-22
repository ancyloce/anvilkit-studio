import {
	asInteger,
	asString,
	type ModelCall,
	runImageRoute,
} from "../_lib/replicate";

export const runtime = "nodejs";

/** Text-to-image via SDXL. Body: `AiImageTextToImageRequest`. */
export function POST(req: Request): Promise<Response> {
	return runImageRoute(req, (body) => {
		const prompt = asString(body.prompt);
		if (!prompt) {
			return {
				error: { code: "BAD_REQUEST", message: "`prompt` is required." },
			};
		}
		const input: Record<string, unknown> = { prompt };
		const negativePrompt = asString(body.negativePrompt);
		if (negativePrompt) {
			input.negative_prompt = negativePrompt;
		}
		const width = asInteger(body.width);
		if (width !== undefined) {
			input.width = width;
		}
		const height = asInteger(body.height);
		if (height !== undefined) {
			input.height = height;
		}
		const seed = asInteger(body.seed);
		if (seed !== undefined) {
			input.seed = seed;
		}
		return { model: "stability-ai/sdxl", input } satisfies ModelCall;
	});
}
