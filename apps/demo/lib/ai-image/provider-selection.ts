/**
 * Chooses the AI-image provider for the demo's Canvas Studio (task I1-11).
 *
 * The mock provider is the default so the demo works offline. When
 * `NEXT_PUBLIC_AI_IMAGE_REAL=1` (and the server has `REPLICATE_API_TOKEN`),
 * the real Replicate-backed provider is used instead. The token itself is
 * read server-side in the route handlers — this public flag only signals
 * that a real provider is configured, so the secret never reaches the
 * client bundle.
 */
import type { AiImageProvider } from "@anvilkit/canvas-core";
import { createMockAiImageProvider } from "@anvilkit/plugin-ai-image/mock";
import {
	type CreateReplicateImageProviderOptions,
	createReplicateImageProvider,
} from "./replicate-image-provider";

export type SelectAiImageProviderOptions = CreateReplicateImageProviderOptions;

/** True when the demo is configured to route jobs through the real provider. */
export function isRealAiImageEnabled(): boolean {
	return process.env.NEXT_PUBLIC_AI_IMAGE_REAL === "1";
}

export function selectAiImageProvider(
	options: SelectAiImageProviderOptions,
): AiImageProvider {
	if (isRealAiImageEnabled()) {
		return createReplicateImageProvider(options);
	}
	return createMockAiImageProvider({ delayMs: 400 });
}
