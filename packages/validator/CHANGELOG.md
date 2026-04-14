# @anvilkit/validator

## 0.1.0-alpha.0 — 2026-04-14

### Added

- **Validation API** — `validateComponentConfig` and
  `validateAiOutput` as the public export-readiness and AI response
  validation surface for Phase 3.
- **Documented issue tables** — README error-code tables for
  `validateComponentConfig`
  (`E_MISSING_RENDER`, `E_MISSING_FIELDS`,
  `E_NON_SERIALIZABLE_DEFAULT`, `E_FIELD_SHAPE_INVALID`,
  `E_ASYNC_RENDER`, `W_MISSING_DESCRIPTION`,
  `W_UNKNOWN_FIELD_TYPE`) and `validateAiOutput`
  (`INVALID_STRUCTURE`, `UNSUPPORTED_VERSION`,
  `UNKNOWN_COMPONENT`, `MISSING_REQUIRED_FIELD`,
  `INVALID_FIELD_TYPE`, `INVALID_ENUM_VALUE`, `INVALID_ASSET`,
  `MAX_DEPTH_EXCEEDED`, `UNKNOWN_FIELD`).
- **Quality gates** — `check:publint`, `check:circular`,
  `check:react-free-runtime`, `check:peer-deps`,
  `check:bundle-budget` (6 KB gzipped limit), and
  `check:api-snapshot`.

### Notes

- **Alpha release.** Consumers should pin exact `0.1.0-alpha.x`
  versions until the validator contract settles.
- **`zod/mini` internals.** The implementation now uses `zod/mini`
  internally as a dependency-size optimization. The public API and
  emitted validation issue shapes are unchanged.
