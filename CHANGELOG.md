# AnvilKit Studio changelog

This file is the **aggregate** release log for the AnvilKit Studio
monorepo. Per-package Changesets-managed changelogs remain
authoritative for each package's individual release history and are
linked below.

## [1.0.0-beta.0] — 2026-08

First public beta of the Studio runtime cone, the first-party plugins,
and the shared `@anvilkit/ui` package. The runtime cone
(`@anvilkit/core`, `ir`, `schema`, `validator`) and both first-party
plugins pin the `1.0.0-beta` line; component packages in
`packages/components/` stay on their independent `0.0.x` cadence and
are not bumped to `1.0` with this release.

### Packages at `1.0.0-beta.0`

| Package                            | Notes                                                                                                   | Changelog                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `@anvilkit/core`                   | `<Studio>`, `StudioConfigSchema`, `compilePlugins`, `StudioPlugin` contract, `StudioError` family.      | [packages/core/CHANGELOG.md](packages/core/CHANGELOG.md)                     |
| `@anvilkit/ir`                     | `puckDataToIR`, `irToPuckData`, `collectAssets`, `identifySlots` — round-trip Page IR.                 | [packages/ir/CHANGELOG.md](packages/ir/CHANGELOG.md)                         |
| `@anvilkit/schema`                 | `configToAiContext`, `extractFieldSchema`, `identifySlotFields`, `isJsonSerializable`.                 | [packages/schema/CHANGELOG.md](packages/schema/CHANGELOG.md)                 |
| `@anvilkit/validator`              | `validateComponentConfig`, `validateAiOutput` — closes phase4-014 F-1 / F-2 / F-3.                     | [packages/validator/CHANGELOG.md](packages/validator/CHANGELOG.md)           |
| `@anvilkit/utils`                  | First public release of the zero-dep helper set.                                                        | [packages/utils/CHANGELOG.md](packages/utils/CHANGELOG.md)                   |
| `@anvilkit/ui`                     | First public npm publish of the shared primitives.                                                      | [packages/ui/CHANGELOG.md](packages/ui/CHANGELOG.md)                         |
| `@anvilkit/plugin-export-html`     | First real HTML exporter; 24-test XSS/URL/CSS-injection battery.                                        | [packages/plugins/plugin-export-html/CHANGELOG.md](packages/plugins/plugin-export-html/CHANGELOG.md) |
| `@anvilkit/plugin-ai-copilot`      | Headless AI copilot + `./mock` subpath; validator-gated generation.                                     | [packages/plugins/plugin-ai-copilot/CHANGELOG.md](packages/plugins/plugin-ai-copilot/CHANGELOG.md)   |

Component packages in `packages/components/src/*` remain on their
existing independent `0.0.x` versions and are not part of this
fixed-group bump. Consumers of `@anvilkit/core@^1.0.0-beta` can
continue to mix any currently-published component package.

### Added — runtime cone

- **`@anvilkit/core`** — the `<Studio>` React shell,
  `StudioConfigSchema` (Zod v4, strict, with `.prefault({})`
  sections so callers can omit entire blocks), `compilePlugins`,
  `createLifecycleManager`, `createExportRegistry`,
  `composeHeaderActions`, the `StudioError` / `StudioPluginError` /
  `StudioConfigError` / `StudioExportError` class family,
  `useStudio`, `useExportStore`, `useAiStore`, `useThemeStore`, and
  the `aiHostAdapter` compat shim at `@anvilkit/core/compat`.
- **`@anvilkit/core/testing`** — non-breaking subpath shipping
  `createFakeStudioContext`, `createFakePageIR`, and
  `registerPlugin` for plugin authors and downstream test suites
  (phase4-012).
- **`@anvilkit/ir`** — `puckDataToIR`, `irToPuckData`,
  `collectAssets`, `identifySlots` as the public Page IR round-trip
  and asset/slot inspection surface.
- **`@anvilkit/schema`** — `configToAiContext`, `extractFieldSchema`,
  `identifySlotFields`, `isJsonSerializable` for converting Puck
  component configs into AI-safe prompt context.
- **`@anvilkit/validator`** — `validateComponentConfig` and
  `validateAiOutput` with documented error-code tables
  (`E_MISSING_RENDER`, `E_NON_SERIALIZABLE_DEFAULT`,
  `E_FIELD_SHAPE_INVALID`, `INVALID_STRUCTURE`, `UNKNOWN_COMPONENT`,
  `MISSING_REQUIRED_FIELD`, `MAX_DEPTH_EXCEEDED`, and more).

### Added — plugins

- **`@anvilkit/plugin-export-html`** — `createHtmlExportPlugin`, the
  public `htmlFormat`, `exportHtmlHeaderAction`, and export types,
  plus the 24-test hostile-input battery (XSS, URL schemes,
  CSS injection) enforcing the escape contract documented in
  `docs/security/plugin-trust-model.md` §5.
- **`@anvilkit/plugin-ai-copilot`** — `createAiCopilotPlugin`, the
  `./mock` subpath with `mockGeneratePage`, structured
  `ai-copilot:error` events (`VALIDATION_FAILED` etc.), and the
  18-test malformed-PageIR / oversized-input / prompt-injection
  battery.

### Added — tooling and docs

- **`create-anvilkit-plugin`** — standalone scaffolder for
  `@anvilkit/*` StudioPlugin packages (`pnpm dlx
  create-anvilkit-plugin --name my-plugin --display "My Plugin"
  --category rail-panel`). Generates `package.json`, `tsconfig`,
  `biome`, `rslib`, `vitest`, `src/index.ts` factory, baseline test
  using `@anvilkit/core/testing`, and README.
- **Docs site** at [docs.anvilkit.dev](https://anvilkit.dev) —
  Starlight-powered, with a generated component catalog, TypeDoc API
  reference, guides for component / plugin / generator / export / AI
  workflows, and an interactive Puck playground.
- **`pnpm bench`** — performance harness using tinybench and
  `bench/baseline.json` for regression tracking (phase4-015).
- **`pnpm size`** — per-package size budgets enforced via size-limit
  and `.size-limit.json` (phase4-016).

### Changed — behaviour (breaking)

Three validator-level behaviour changes landed as part of the
phase4-014 security review. Each is covered by a flipped-pin test in
`plugin-ai-copilot/src/__tests__/security.test.ts`:

1. `validateAiOutput` now rejects `root.type !== "__root__"` with
   `[INVALID_ROOT_TYPE]` (F-1).
2. `validateAiOutput` now rejects a non-array `root.children` with
   `[INVALID_CHILDREN]`, surfacing structured `VALIDATION_FAILED`
   events instead of a `TypeError` from `runGeneration()` (F-2).
3. `validateAiOutput` now rejects non-JSON-serialisable `props`
   (functions, symbols, bigints, recursively) with
   `[NON_SERIALIZABLE_PROP]`. The walker is cycle-safe and
   depth-bounded at `MAX_DEPTH` (F-3).

See the [migration guide](docs/migration/0.x-to-1.0-beta.md) for
before/after snippets and adapter-level upgrade steps.

### Infrastructure

- `.changeset/config.json` pre-release mode: `pnpm changeset pre
  enter beta` → releases publish with the `beta` dist-tag.
- CI workflow `publish.yml` auto-publishes on merge to `main` when
  changesets exist. `@anvilkit/ui` has its own `publish-ui.yml`
  workflow for the first public release.
- Per-package release gates (`check:all`) for core, ir, schema,
  validator, and plugins run on every PR.
- `pnpm publint` validates `package.json` exports across every
  workspace package.

### Links

- Migration guide — [`docs/migration/0.x-to-1.0-beta.md`](docs/migration/0.x-to-1.0-beta.md)
- Beta feedback channel — [`docs/beta-feedback/README.md`](docs/beta-feedback/README.md)
- Public announcement draft — [`docs/announcements/2026-08-v1-beta.md`](docs/announcements/2026-08-v1-beta.md)
- Docs — [docs.anvilkit.dev](https://anvilkit.dev)

[1.0.0-beta.0]: https://github.com/ancyloce/anvilkit-studio/releases/tag/v1.0.0-beta.0
