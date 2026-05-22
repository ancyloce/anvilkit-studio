/**
 * Client-side {@link AiImageProvider} that drives the demo's
 * `/api/canvas/ai/*` routes (task I1-11) and assetizes the result.
 *
 * Flow per job:
 *   1. Resolve `sourceAssetId` / `maskAssetId` to URLs via the injected
 *      `getAssetUrl` (the host's asset registry) and POST the request to
 *      `/api/canvas/ai/<kind>`.
 *   2. The route runs Replicate and returns `{ imageUrl }`.
 *   3. Fetch the image and run it through `createPostProcessPipeline`
 *      (validate / compress / thumbnail / register) → `resultAssetId`.
 *
 * Provider-level failures resolve to a terminal `status: "error"` result
 * (so the panel surfaces the message), mirroring the mock provider. An
 * aborted signal rejects with the original `AbortError` so the wrapping
 * `AiJobClient` resolves it to a `cancelled` result.
 */
import type {
	AiImageJobError,
	AiImageJobRequest,
	AiImageJobResult,
	AiImageProvider,
	AiLayerContext,
} from "@anvilkit/canvas-core";
import type { PostProcessUpload } from "@anvilkit/plugin-ai-image";
import { createPostProcessPipeline } from "@anvilkit/plugin-ai-image/post-process";

export interface CreateReplicateImageProviderOptions {
	/** Resolves an asset id to its URL (e.g. `(id) => registry.get(id)?.url`). */
	readonly getAssetUrl: (assetId: string) => string | undefined;
	/** Registers a produced `File`, resolving to its asset id. */
	readonly upload: PostProcessUpload;
	/** Route base. @default `"/api/canvas/ai"` */
	readonly baseUrl?: string;
	/** Fetch override (mainly for tests). @default `globalThis.fetch` */
	readonly fetchImpl?: typeof fetch;
}

interface RouteSuccessBody {
	imageUrl: string;
}

interface RouteErrorBody {
	error?: { code?: string; message?: string };
}

function isAbortError(err: unknown): boolean {
	return err instanceof Error && err.name === "AbortError";
}

function errorMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
}

/**
 * Build the POST body for a job: the request fields plus the wire-only
 * resolved image URLs source ops need. Returns an `AiImageJobError` when a
 * referenced asset id is missing from the registry.
 */
function resolveBody(
	request: AiImageJobRequest,
	getAssetUrl: (assetId: string) => string | undefined,
): { body: Record<string, unknown> } | { error: AiImageJobError } {
	const urlFor = (
		assetId: string,
	): { url: string } | { error: AiImageJobError } => {
		const url = getAssetUrl(assetId);
		return url
			? { url }
			: {
					error: {
						code: "ASSET_NOT_FOUND",
						message: `No registered asset for id "${assetId}".`,
					},
				};
	};

	switch (request.kind) {
		case "text-to-image":
			return { body: { ...request } };
		case "variation":
		case "bg-remove":
		case "upscale": {
			const source = urlFor(request.sourceAssetId);
			if ("error" in source) {
				return source;
			}
			return { body: { ...request, sourceImageUrl: source.url } };
		}
		case "inpaint": {
			const source = urlFor(request.sourceAssetId);
			if ("error" in source) {
				return source;
			}
			const mask = urlFor(request.maskAssetId);
			if ("error" in mask) {
				return mask;
			}
			return {
				body: {
					...request,
					sourceImageUrl: source.url,
					maskImageUrl: mask.url,
				},
			};
		}
	}
}

export function createReplicateImageProvider(
	options: CreateReplicateImageProviderOptions,
): AiImageProvider {
	const baseUrl = options.baseUrl ?? "/api/canvas/ai";
	const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
	const pipeline = createPostProcessPipeline({
		upload: options.upload,
		compress: { mimeType: "image/webp", quality: 0.9 },
	});

	return async (
		request: AiImageJobRequest,
		_context: AiLayerContext,
		runOptions,
	): Promise<AiImageJobResult> => {
		const startedAt = Date.now();
		const jobId = `replicate-${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
		const signal = runOptions?.signal;

		const error = (err: AiImageJobError): AiImageJobResult => ({
			jobId,
			status: "error",
			error: err,
			startedAt,
			finishedAt: Date.now(),
		});

		const resolved = resolveBody(request, options.getAssetUrl);
		if ("error" in resolved) {
			return error(resolved.error);
		}

		// 1. Submit the job to the route.
		let response: Response;
		try {
			response = await doFetch(`${baseUrl}/${request.kind}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(resolved.body),
				...(signal ? { signal } : {}),
			});
		} catch (err) {
			if (isAbortError(err)) throw err;
			return error({
				code: "NETWORK_ERROR",
				message: errorMessage(err, "Failed to reach the AI image route."),
			});
		}

		if (!response.ok) {
			const parsed = (await response
				.json()
				.catch(() => null)) as RouteErrorBody | null;
			return error({
				code: parsed?.error?.code ?? `HTTP_${response.status}`,
				message:
					parsed?.error?.message ??
					`AI image route responded ${response.status}.`,
			});
		}

		const { imageUrl } = (await response.json()) as RouteSuccessBody;

		// 2. Fetch the produced image.
		let blob: Blob;
		try {
			const imageResponse = await doFetch(imageUrl, signal ? { signal } : {});
			if (!imageResponse.ok) {
				return error({
					code: "IMAGE_FETCH_FAILED",
					message: `Fetching the generated image returned ${imageResponse.status}.`,
				});
			}
			blob = await imageResponse.blob();
		} catch (err) {
			if (isAbortError(err)) throw err;
			return error({
				code: "IMAGE_FETCH_FAILED",
				message: errorMessage(err, "Failed to fetch the generated image."),
			});
		}

		// 3. Assetize via the post-process pipeline.
		try {
			const { assetId } = await pipeline.process(blob);
			return {
				jobId,
				status: "complete",
				resultAssetId: assetId,
				startedAt,
				finishedAt: Date.now(),
			};
		} catch (err) {
			return error({
				code: "POST_PROCESS_FAILED",
				message: errorMessage(err, "Failed to register the generated image."),
			});
		}
	};
}
