# @anvilkit/example-ai-adapter-anthropic

Reference `generatePage()` adapter for `@anvilkit/plugin-ai-copilot`
backed by Anthropic's Claude API. See the companion AI integration
guide at `apps/docs/src/content/docs/guides/ai-integration.mdx`
(phase4-010) for the full trust model and adapter context.

## Use it

```ts
// server-only module in your host app
import { createAiCopilotPlugin } from "@anvilkit/plugin-ai-copilot";
import { generatePage } from "@anvilkit/example-ai-adapter-anthropic";

export const aiCopilot = createAiCopilotPlugin({
	generatePage,
	puckConfig,
	timeoutMs: 30_000,
});
```

## Environment

- `AI_API_KEY` — your Anthropic API key. **Backend only.** The
  adapter throws on `generatePage` invocation if the key isn't set.

## Build

```bash
pnpm -C examples/ai-adapters/anthropic build
```

## What this is not

- It is not a drop-in for every prompt. The system prompt here is
  minimal; production apps should tune it for their component
  vocabulary and add few-shot examples from
  `ctx.availableComponents[].example`.
- It is not a client-side adapter. If you need the copilot to work
  from a browser, use the generic fetch adapter and place a
  server-owned HTTP route between your client and Anthropic.
