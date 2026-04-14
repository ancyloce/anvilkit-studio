# @anvilkit/validator

Export-readiness validation for Puck component configs and AI-generated output.

> **Alpha status (0.1.x).** Both `validateComponentConfig` and `validateAiOutput` are implemented and tested.

## Install

```bash
pnpm add @anvilkit/validator @puckeditor/core
```

## Quickstart

### Validating a Puck component config

```ts
import { validateComponentConfig } from "@anvilkit/validator";

const result = validateComponentConfig(puckConfig);
if (!result.valid) {
  console.error("Config issues:", result.issues);
}
```

### Validating LLM-generated PageIR

```ts
import { validateAiOutput } from "@anvilkit/validator";

const result = validateAiOutput(llmResponse, availableComponents);
if (!result.valid) {
  // Do NOT dispatch to Puck — surface issues back to the AI retry loop.
  console.error("AI output rejected:", result.issues);
}
```

## Phase 3 references

See the [Phase 3 plan](../../docs/plans/phase-3-export-ai-pipeline-plan.md)
(`M3 — @anvilkit/validator`) and the
[architecture package catalog](../../docs/ai-context/anvilkit-architecture.md)
(`§7 — @anvilkit/validator [Planned]`) for the validator's trust
boundary and dependency rules.

## Error Codes — `validateComponentConfig`

| Code | Level | Description |
|------|-------|-------------|
| `E_MISSING_RENDER` | error | `component.render` is not a function |
| `E_MISSING_FIELDS` | error | `component.fields` is not an object |
| `E_NON_SERIALIZABLE_DEFAULT` | error | A default prop value fails JSON serialization |
| `E_FIELD_SHAPE_INVALID` | error | A field does not match the Puck Field union |
| `E_ASYNC_RENDER` | error | `component.render` is an async function (Puck does not support async render) |
| `W_MISSING_DESCRIPTION` | warning | `component.metadata?.description` is empty or undefined |
| `W_UNKNOWN_FIELD_TYPE` | warning | Field type is not one of the 10 AiFieldType cases |

### Why `E_ASYNC_RENDER` is a hard failure

Puck renders components synchronously during its reconciliation loop. An async render function silently breaks — it returns a Promise object instead of React elements, which Puck coerces to `[object Promise]` or a blank node. This is impossible to debug from the editor, so we fail hard at validation time.

## Issue Codes — `validateAiOutput`

Codes are embedded as a `[CODE]` prefix in each `AiValidationIssue.message`. Callers (notably the AI copilot retry loop in Phase 4) switch on them.

| Code | Severity | Description |
|------|----------|-------------|
| `INVALID_STRUCTURE` | error | Response is not an object, missing `root`, or `type` is not a string |
| `UNSUPPORTED_VERSION` | error | `PageIR.version` is not `"1"` |
| `UNKNOWN_COMPONENT` | error | Node `type` is not in `availableComponents` (may include a closest-match suggestion) |
| `MISSING_REQUIRED_FIELD` | error | A required field is absent from `node.props` |
| `INVALID_FIELD_TYPE` | error | A field value does not match the declared `AiFieldType` |
| `INVALID_ENUM_VALUE` | error | A `select` field received a value outside the declared options |
| `INVALID_ASSET` | error | An entry in `PageIR.assets` is malformed (bad `kind`, missing `url`, etc.) |
| `MAX_DEPTH_EXCEEDED` | error | Node tree exceeds the hard cap of 16 levels (DoS guard) |
| `UNKNOWN_FIELD` | warn | A prop is not declared in the component's `AiComponentSchema.fields` |

### Trust boundary

`validateAiOutput` is the only thing standing between untrusted LLM output and `puckApi.dispatch`. If `result.valid === false`, the caller MUST NOT apply the response. Per architecture §9, validation failure surfaces immediately; retry logic is Phase 4.

## Dependency contract

| Allowed | Forbidden |
|---------|-----------|
| `@anvilkit/schema` (runtime) | `@anvilkit/ir`, React, plugins |
| `@anvilkit/utils` (runtime) | |
| `zod` (runtime) | |
| `@anvilkit/core` (types-only) | |
| `@puckeditor/core` (peer, types-only) | |

## Peer dependencies

| Package | Version |
| ------- | ------- |
| `@puckeditor/core` | `^0.19.0` |
