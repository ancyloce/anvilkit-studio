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
import type {
	AiImageProvider,
	AiImageProviderDescriptor,
} from "@anvilkit/canvas-core";
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

/**
 * Capability discovery kept next to provider selection so the panel can never
 * advertise an operation that the selected transport cannot execute.
 */
export function selectAiImageProviderDescriptor(): AiImageProviderDescriptor {
	const shared = {
		constraints: {
			maxPromptCharacters: 4_000,
			maxWidth: 4_096,
			maxHeight: 4_096,
			maxPixels: 16_777_216,
		},
	} as const;
	if (isRealAiImageEnabled()) {
		return {
			providerId: "replicate",
			displayName: "Replicate",
			capabilities: [
				{ kind: "text-to-image", available: true, ...shared },
				{ kind: "bg-remove", available: true, ...shared },
			],
		};
	}
	return {
		providerId: "anvilkit-mock",
		displayName: "AnvilKit offline mock",
		capabilities: [
			{ kind: "text-to-image", available: true, ...shared },
			{ kind: "bg-remove", available: true, ...shared },
			{ kind: "object-erase", available: true, ...shared },
			{ kind: "generative-expand", available: true, ...shared },
		],
	};
}
