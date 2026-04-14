# @anvilkit/ir

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
