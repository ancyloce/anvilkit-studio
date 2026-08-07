---
"@anvilkit/schema": minor
---

Canonical editor validation: unversioned metadata schemas and a widened
authorable-property enum (PLAN-0026 §2, §5; PLAN-0028 P1).

**Breaking — renamed exports** on `@anvilkit/schema/editor`, tracking the
contracts rename:

- `ComponentMetadataV2Schema` → `ComponentMetadataSchema`
- `StyleTargetCapabilityV2Schema` → `StyleTargetCapabilitySchema`

Neither carries a `version` literal any more.

**Widened.** `AuthorableStylePropertySchema` grows from 23 to 40 members to
mirror `AuthorableStyleProperty` in `@anvilkit/contracts`.

**Appearance is version-free.** `AnvilAppearanceSchema`,
`TargetAppearanceSchema` and `AuthorStyleSchema` no longer declare
`version: z.literal("1")`, and `canonicalizeAppearance` no longer emits a
`version` key. A canonical, version-free appearance now validates — under
the old schemas it failed, because the literal was required.

**Stale `version` keys are tolerated, deliberately and temporarily.**
Documents written before data finalization may still carry one. Every object
schema is `looseObject`, so such a key parses and round-trips unchanged, and
nothing reads it to decide how to parse. This is generic unknown-key
preservation, not a version branch — and it is a **time-boxed migration
window that closes when the store migration runs**, not a supported second
document shape. The barrel header states the deadline and the two families
of `z.literal("1")` that remain (the legacy `__anvilkit` sidecar readers,
whose literal is a data-loss guard, and four canonical sub-shapes whose
contracts interfaces must drop `version` in the same change).

No module was removed from `@anvilkit/schema/editor`: a consumer audit found
live consumers for `compact`, `envelope`, `canonical-serialize` and
`migrations`, so all four are retained.
