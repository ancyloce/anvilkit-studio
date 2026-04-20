# @anvilkit/example-ai-adapter-openai

Reference `generatePage()` adapter backed by OpenAI's Chat
Completions API. See the AI integration guide (phase4-010) for the
full context.

## Use it

```ts
// server-only module in your host app
import { createAiCopilotPlugin } from "@anvilkit/plugin-ai-copilot";
import { generatePage } from "@anvilkit/example-ai-adapter-openai";

export const aiCopilot = createAiCopilotPlugin({
	generatePage,
	puckConfig,
});
```

## Environment

- `AI_API_KEY` — your OpenAI API key. Backend only; keep out of
  `NEXT_PUBLIC_*` / `VITE_*` / other client-inlined prefixes.

## Build

```bash
pnpm -C examples/ai-adapters/openai build
```

## Notes

- `response_format: { type: "json_object" }` makes the model emit
  parseable JSON, but the PageIR schema is still validated by
  `@anvilkit/validator` inside the plugin before dispatch.
- Replace the system prompt with your own component vocabulary and
  few-shot examples for higher-quality generations.
