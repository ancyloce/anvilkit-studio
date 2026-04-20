/**
 * Example Anthropic Claude adapter for `createAiCopilotPlugin`.
 *
 * Drop this into a **server-only** module of your host app and pass
 * the exported `generatePage` to `createAiCopilotPlugin({ generatePage })`.
 * The secret comes from `AI_API_KEY` in the backend environment;
 * never inline the key and never import this file from client code.
 *
 * See `docs/security/plugin-trust-model.md` §3 and the AI integration
 * guide (phase4-010) for the full trust model.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { GeneratePageFn } from "@anvilkit/plugin-ai-copilot";
import type { PageIR } from "@anvilkit/core/types";

const MAX_PROMPT_LENGTH = 4_000;

function readApiKey(): string {
	const key = process.env.AI_API_KEY;
	if (!key) {
		throw new Error(
			"AI_API_KEY is not set on the backend. This adapter must run server-side.",
		);
	}
	return key;
}

export const generatePage: GeneratePageFn = async (prompt, ctx) => {
	if (prompt.length > MAX_PROMPT_LENGTH) {
		throw new Error(
			`Prompt too long (${prompt.length} > ${MAX_PROMPT_LENGTH} chars).`,
		);
	}
	const client = new Anthropic({ apiKey: readApiKey() });
	const response = await client.messages.create({
		model: "claude-sonnet-4-6",
		max_tokens: 4_096,
		system:
			"You are a page generator. Return ONLY a JSON PageIR. " +
			"Allowed component types: " +
			ctx.availableComponents.map((c) => c.componentName).join(", "),
		messages: [{ role: "user", content: prompt }],
	});
	const block = response.content[0];
	if (!block || block.type !== "text") {
		throw new Error("Anthropic response did not contain a text block.");
	}
	return JSON.parse(block.text) as PageIR;
};
