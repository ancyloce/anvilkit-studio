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
| `E_NON_SERIALIZABLE_DEFAULT` | error | A default prop value fails JSON serialization (checked recursively — a function buried inside a nested object still trips this) |
| `E_FIELD_SHAPE_INVALID` | error | A field does not match the Puck Field union |
| `E_ASYNC_RENDER` | error | `component.render` is an async function (Puck does not support async render) |
| `W_MISSING_DESCRIPTION` | warning | `component.metadata?.description` is empty or undefined |
| `W_UNKNOWN_FIELD_TYPE` | warning | Field `type` is not one of the 11 known Puck field types: `text`, `textarea`, `richtext`, `number`, `select`, `radio`, `array`, `object`, `external`, `custom`, `slot`. (Note: this is the Puck-native field union, not the smaller 10-member `AiFieldType` used by `validateAiOutput`.) |

### Why `E_ASYNC_RENDER` is a hard failure

Puck renders components synchronously during its reconciliation loop. An async render function silently breaks — it returns a Promise object instead of React elements, which Puck coerces to `[object Promise]` or a blank node. This is impossible to debug from the editor, so we fail hard at validation time.

**Detection limit.** The check uses `renderValue.constructor?.name === "AsyncFunction"`, which catches native, unminified `async function` and `async () =>` declarations. It does **not** catch:

- async functions transpiled to ES2016 or below (they become regular generator-driven functions whose `constructor.name` is `"Function"`)
- `async`-returning functions wrapped by `bind()` or by HOFs (memoize, throttle, etc.)

If your build pipeline transpiles async syntax, audit render functions manually — the validator may give a clean bill of health on a function that will silently break in Puck.

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

### Validation depth limits

- **Node tree:** capped at 16 nesting levels (depths `0…15`). A 17-level tree errors with `[MAX_DEPTH_EXCEEDED]`.
- **Prop values:** capped at 64 nesting levels. The looser cap exists so a deeply-nested theme dictionary or config object passed as a prop still validates.

### `object`-typed fields are not deeply validated

Fields declared with `type: "object"` in `AiComponentSchema` are validated as `record(string, unknown)` — any object passes regardless of inner shape. The schema does not currently carry inner field information for object props; if you need shape-level checks, model the inner fields explicitly or perform the check downstream. The recursive `[NON_SERIALIZABLE_PROP]` walk still applies, so functions / symbols / bigints buried in an object prop are still rejected.

## Dependency contract

| Allowed | Forbidden |
|---------|-----------|
| `@anvilkit/schema` (runtime) | `@anvilkit/ir`, React, plugins |
| `zod` (runtime) | `@anvilkit/utils` |
| `@anvilkit/core` (types-only) | |
| `@puckeditor/core` (peer, types-only) | |

## Peer dependencies

| Package | Version |
| ------- | ------- |
| `@puckeditor/core` | `^0.19.0` |
