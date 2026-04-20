/**
 * Example OpenAI adapter for `createAiCopilotPlugin`. Server-only;
 * see `docs/security/plugin-trust-model.md` §3.
 */
import OpenAI from "openai";
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
	const client = new OpenAI({ apiKey: readApiKey() });
	const response = await client.chat.completions.create({
		model: "gpt-5",
		response_format: { type: "json_object" },
		messages: [
			{
				role: "system",
				content:
					"Return JSON PageIR only. Allowed components: " +
					ctx.availableComponents.map((c) => c.componentName).join(", "),
			},
			{ role: "user", content: prompt },
		],
	});
	const text = response.choices[0]?.message?.content;
	if (!text) throw new Error("OpenAI response had no content.");
	return JSON.parse(text) as PageIR;
};
