# @anvilkit/schema

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
