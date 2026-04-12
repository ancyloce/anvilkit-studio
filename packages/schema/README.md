# @anvilkit/schema

Derive AI-friendly component schemas from a Puck `Config`. The primary
exports — `configToAiContext` and `extractFieldSchema` — map Puck config
and field definitions to [`AiGenerationContext`](../core/src/types/ai.ts)
and [`AiFieldSchema`](../core/src/types/ai.ts) that the AI copilot plugin
feeds into its system prompt.

> **Alpha status (0.1.x).** `configToAiContext`, `identifySlotFields`,
> `extractFieldSchema`, and `isJsonSerializable` are implemented and tested.

## Quickstart

```ts
import { configToAiContext } from "@anvilkit/schema";
const ctx = configToAiContext(puckConfig);
// ctx.availableComponents is ready to ship to an LLM
```

### Per-field extraction

```ts
import { extractFieldSchema } from "@anvilkit/schema";
import type { Field } from "@puckeditor/core";

const puckField: Field = { type: "text" };
const schema = extractFieldSchema("title", puckField);
// => { name: "title", type: "text" }
```

## Public API

| Export                    | Signature                                                              | Purpose                                                       |
| ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| `configToAiContext`       | `(config: Config, opts?) => AiGenerationContext`                       | Derive full AI context from a Puck config.                    |
| `identifySlotFields`     | `(config: Config) => Map<string, readonly string[]>`                   | Identify slot fields per component.                           |
| `extractFieldSchema`     | `(name: string, field: Field, opts?) => AiFieldSchema`                 | Map a single Puck field to an AI-friendly schema.             |
| `isJsonSerializable`     | `(value: unknown, opts?) => boolean`                                   | Check if a value is safe for JSON serialization.              |

### `ConfigToAiContextOptions`

| Option     | Type       | Default     | Description                                    |
| ---------- | ---------- | ----------- | ---------------------------------------------- |
| `include`  | `string[]` | all components | Whitelist a subset of components to include. |

## Required heuristic

Puck does not expose a per-field `required` flag. The heuristic used:
a field is considered required when its label is present and not empty.
This is conservative — override via `opts.required` if needed.

## Dependency contract

| Allowed                              | Forbidden                                                               |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `@anvilkit/utils` (runtime)          | `@anvilkit/ir`, `@anvilkit/validator`, `@anvilkit/core` runtime         |
| `@puckeditor/core` (peer, types-only)| React, ReactDOM, any plugin package, any DOM API                        |
