import {
	asFiniteNumber,
	asString,
	type ModelCall,
	runImageRoute,
} from "../_lib/replicate";

export const runtime = "nodejs";

/**
 * Upscale via Real-ESRGAN. Body: `AiImageUpscaleRequest` plus the wire-only
 * `sourceImageUrl` the client resolves from `sourceAssetId`.
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
		const input: Record<string, unknown> = {
			image,
			scale: asFiniteNumber(body.scale) ?? 4,
		};
		return { model: "nightmareai/real-esrgan", input } satisfies ModelCall;
	});
}
