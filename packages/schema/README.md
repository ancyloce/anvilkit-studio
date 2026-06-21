# @anvilkit/schema

Derive AI-friendly component schemas from a Puck `Config`. The primary
exports — `configToAiContext` and `extractFieldSchema` — map Puck config
and field definitions to [`AiGenerationContext`](../core/src/types/ai.ts)
and [`AiFieldSchema`](../core/src/types/ai.ts) that the AI copilot plugin
feeds into its system prompt.

> **Alpha status (0.1.x).** `configToAiContext`, `identifySlotFields`,
> `extractFieldSchema`, `isJsonSerializable`, and the `PageRootSchema` /
> `PageSeoSchema` Zod schemas are implemented and tested.

## Install

```bash
pnpm add @anvilkit/schema @puckeditor/core zod
```

## Quickstart

```ts
import { configToAiContext } from "@anvilkit/schema";
import type { Config } from "@puckeditor/core";

declare const puckConfig: Config;

const ctx = configToAiContext(puckConfig);
const firstComponent = ctx.availableComponents[0];

console.log(firstComponent?.componentName);
```

### Per-field extraction

```ts
import { extractFieldSchema } from "@anvilkit/schema";
import type { Field } from "@puckeditor/core";

const puckField: Field = { type: "text" };
const schema = extractFieldSchema("title", puckField);
// => { name: "title", type: "text" }
```

### Guarding against non-serializable props

```ts
import { isJsonSerializable } from "@anvilkit/schema";

isJsonSerializable({ title: "Hello", count: 3 }); // => true
isJsonSerializable({ onClick: () => {} }); // => false (functions are not serializable)
```

### Limiting the context to specific components

```ts
import { configToAiContext } from "@anvilkit/schema";
import type { Config } from "@puckeditor/core";

declare const puckConfig: Config;

// Whitelist a subset so the AI prompt only sees these components.
const ctx = configToAiContext(puckConfig, {
  include: ["Hero", "PricingMinimal"],
});
```

## Architecture context

`@anvilkit/schema` is consumed by `@anvilkit/plugin-ai-copilot` and
`@anvilkit/validator`. It is React-free and has no `@anvilkit/*`
runtime dependencies. See [docs/ai-context/anvilkit-architecture.md](../../docs/ai-context/anvilkit-architecture.md)
for the full package catalog.

## Public API

| Export               | Signature                                              | Purpose                                           |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `configToAiContext`  | `(config: Config, opts?) => AiGenerationContext`       | Derive full AI context from a Puck config.        |
| `identifySlotFields` | `(config: Config) => Map<string, readonly string[]>`   | Identify slot fields per component.               |
| `extractFieldSchema` | `(name: string, field: Field, opts?) => AiFieldSchema` | Map a single Puck field to an AI-friendly schema. |
| `isJsonSerializable` | `(value: unknown, opts?) => boolean`                   | Check if a value is safe for JSON serialization.  |
| `PageRootSchema`     | `ZodType<PageRootProps>`                               | Zod schema for the canonical page `root.props` payload. |
| `PageSeoSchema`      | `ZodType<PageSeo>`                                     | Zod schema for the `root.props.seo` SEO metadata block. |

### `ConfigToAiContextOptions`

| Option    | Type       | Default        | Description                                  |
| --------- | ---------- | -------------- | -------------------------------------------- |
| `include` | `string[]` | all components | Whitelist a subset of components to include. |

## Required fields

Puck does not expose a per-field `required` flag, so derived schemas
omit `required` by default — the AI copilot treats absence as
optional. Callers that know better can override per call by passing
`opts.required` to `extractFieldSchema()`.

## Dependency contract

| Allowed                               | Forbidden                                                       |
| ------------------------------------- | --------------------------------------------------------------- |
| (no runtime deps)                     | `@anvilkit/ir`, `@anvilkit/validator`, `@anvilkit/core` runtime |
| `@puckeditor/core` (peer, types-only) | React, ReactDOM, any plugin package, any DOM API                |

## Peer dependencies

| Package            | Version   |
| ------------------ | --------- |
| `@puckeditor/core` | `^0.21.3` |
| `zod`              | `^4.4.3`  |
