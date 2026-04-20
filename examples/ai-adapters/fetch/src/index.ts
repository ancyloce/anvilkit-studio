/**
 * Provider-agnostic example adapter for `createAiCopilotPlugin`.
 *
 * Instead of calling an LLM directly, this adapter POSTs to a host-
 * owned backend route. The host-owned route holds the provider
 * credentials and can enforce auth, rate limits, and prompt size in
 * one place. This is the recommended shape when the copilot must
 * work from a browser.
 */
import type { GeneratePageFn } from "@anvilkit/plugin-ai-copilot";
import type { PageIR } from "@anvilkit/core/types";

const MAX_PROMPT_LENGTH = 4_000;

export function createFetchGeneratePage(endpoint: string): GeneratePageFn {
	return async (prompt, ctx) => {
		if (prompt.length > MAX_PROMPT_LENGTH) {
			throw new Error(
				`Prompt too long (${prompt.length} > ${MAX_PROMPT_LENGTH} chars).`,
			);
		}
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				prompt,
				availableComponents: ctx.availableComponents.map(
					(c) => c.componentName,
				),
			}),
		});
		if (!response.ok) {
			throw new Error(`AI endpoint returned ${response.status}`);
		}
		return (await response.json()) as PageIR;
	};
}
