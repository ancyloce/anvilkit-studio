# @anvilkit/schema

## 1.0.0

## 0.1.3

## 0.1.2

## 0.1.1

### Patch Changes

- Routine `0.1.1` patch — coordinated fixed-group bump.

  Aligns the lockstep fixed group at `0.1.1`. Additive only; no breaking
  changes. New surface area in this cut:
  - Section-level AI regeneration (`regenerateSelection`) via
    `@anvilkit/plugin-ai-copilot`, with a reusable `<AiPromptPanel>` in
    `@anvilkit/ui`.
  - `PageIRNode.meta` (locked / owner / notes / version) with diff/apply
    parity across `@anvilkit/ir`, `@anvilkit/schema`, `@anvilkit/validator`,
    and `@anvilkit/plugin-version-history`.
  - Realtime collab integration points (host plugins remain alpha).
  - Marketplace registry feed under the docs site.

## 0.1.0-alpha.0 — 2026-04-14

### Added

- **Schema derivation** — `configToAiContext`, `extractFieldSchema`,
  `identifySlotFields`, and `isJsonSerializable` for converting Puck
  component configs into AI-safe prompt context.
- **Quality gates** — `check:publint`, `check:circular`,
  `check:react-free-runtime`, `check:peer-deps`,
  `check:bundle-budget` (8 KB gzipped limit), and
  `check:api-snapshot`.

### Notes

- **Alpha release.** The public API may still change during the
  `0.1.0-alpha.x` line; consumers should pin exact versions.
- **Required fields are opt-in.** Puck does not expose a first-class
  required flag, so `extractFieldSchema()` and `configToAiContext()`
  omit `required` unless the caller explicitly passes
  `opts.required`. The AI copilot treats absence as optional.
