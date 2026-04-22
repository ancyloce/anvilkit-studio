import type { AiGenerationContext, PageIR } from "@anvilkit/core/types";

export type GeneratePageFn = (
	prompt: string,
	ctx: AiGenerationContext,
) => Promise<PageIR>;

export interface AnvilkitUserConfig {
	readonly generatePage?: GeneratePageFn;
}

export function defineConfig(config: AnvilkitUserConfig): AnvilkitUserConfig {
	return config;
}
