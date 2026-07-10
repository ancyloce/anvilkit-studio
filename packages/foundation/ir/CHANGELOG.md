# @anvilkit/ir

## 0.1.3

### Patch Changes

- Updated dependencies [2438917]
  - @anvilkit/core@0.1.3
  - @anvilkit/utils@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies
  - @anvilkit/core@0.1.2
  - @anvilkit/utils@0.1.2

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

- Updated dependencies
  - @anvilkit/core@0.1.1
  - @anvilkit/utils@0.1.1

## 0.1.0-alpha.0 — 2026-04-14

### Added

- **Transforms** — `puckDataToIR`, `irToPuckData`, `collectAssets`,
  and `identifySlots` as the public Page IR round-trip and asset/slot
  inspection surface for downstream exporters and AI tooling.
- **Quality gates** — `check:publint`, `check:circular`,
  `check:react-free-runtime`, `check:peer-deps`,
  `check:bundle-budget` (6 KB gzipped limit), and
  `check:api-snapshot`.

### Notes

- **Alpha release.** The package is still in the `0.1.0-alpha.x`
  line; consumers should pin exact versions until the public API is
  declared stable.
- **IR contract is now release-gated.** The TypeDoc snapshot,
  round-trip tests, and bundle/dependency gates are the release
  contract for this package. Any future `PageIR` shape change still
  requires the documented minor-bump workflow.
