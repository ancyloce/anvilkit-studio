# @anvilkit/schema

Derive AI-friendly component schemas from a Puck `Config`. The primary
export — `extractFieldSchema` — maps each Puck field definition to an
[`AiFieldSchema`](../core/src/types/ai.ts) that the AI copilot plugin
feeds into its system prompt.

> **Alpha status (0.1.x).** `extractFieldSchema` and `isJsonSerializable`
> are implemented and tested. `configToAiContext` and `identifySlotFields`
> land in `phase3-006`.

## Quickstart

```ts
import { extractFieldSchema } from "@anvilkit/schema";
import type { Field } from "@puckeditor/core";

const puckField: Field = { type: "text" };
const schema = extractFieldSchema("title", puckField);
// => { name: "title", type: "text" }
```

## Public API

| Export                | Signature                                                       | Purpose                                                  |
| --------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| `extractFieldSchema`  | `(name: string, field: Field, opts?) => AiFieldSchema`          | Map a single Puck field to an AI-friendly schema.        |
| `isJsonSerializable`  | `(value: unknown) => boolean`                                   | Check if a value is safe for JSON serialization.         |

## Required heuristic

Puck does not expose a per-field `required` flag. The heuristic used:
a field is considered required when its label is present and not empty.
This is conservative — override via `opts.required` if needed.

## Dependency contract

| Allowed                              | Forbidden                                                               |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `@anvilkit/utils` (runtime)          | `@anvilkit/ir`, `@anvilkit/validator`, `@anvilkit/core` runtime         |
| `@puckeditor/core` (peer, types-only)| React, ReactDOM, any plugin package, any DOM API                        |
