import { asString, type ModelCall, runImageRoute } from "../_lib/replicate";

export const runtime = "nodejs";

/**
 * Background removal. Body: `AiImageBgRemoveRequest` plus the wire-only
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
		return {
			model: "lucataco/remove-bg",
			input: { image },
		} satisfies ModelCall;
	});
}
