# @anvilkit/example-ai-adapter-fetch

Provider-agnostic reference `generatePage()` adapter that POSTs to
a host-owned backend route instead of calling an LLM directly.
Recommended shape when the copilot runs from the browser: keeps
keys server-side and centralises rate limiting / auth / prompt
sizing.

## Use it

```ts
// client or server — both OK, because the secret lives on the
// backend route, not in this adapter.
import { createAiCopilotPlugin } from "@anvilkit/plugin-ai-copilot";
import { createFetchGeneratePage } from "@anvilkit/example-ai-adapter-fetch";

export const aiCopilot = createAiCopilotPlugin({
	generatePage: createFetchGeneratePage("/api/ai/generate-page"),
	puckConfig,
});
```

## Backend route contract

The adapter POSTs:

```json
{
	"prompt": "Build a hero block",
	"availableComponents": ["Hero", "Section", "Pricing"]
}
```

and expects a `200 OK` JSON body shaped as `PageIR`. A non-2xx
response throws, which the plugin turns into `GENERATE_FAILED` on
the event bus.

## Environment

No env var is read by this adapter. The backend route holds the
provider credentials.

## Build

```bash
pnpm -C examples/ai-adapters/fetch build
```
