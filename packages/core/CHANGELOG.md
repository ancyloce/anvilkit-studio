# @anvilkit/core

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
  - @anvilkit/utils@0.1.1
  - @anvilkit/ui@0.1.1

## Unreleased

### Added

- **Studio chrome override preset** — `<Studio>` now ships a
  first-class default chrome (3-pane shell, header with theme
  toggle, viewport toolbar, fields panel) loaded via dynamic
  import from a new `@anvilkit/core/react/overrides` subpath.
  Visible behind the new `chrome` prop.
- **`chrome` prop** on `<Studio>` — `"anvilkit"` (default) or
  `"puck"`. The `"anvilkit"` value composes the new override
  preset into the merge pipeline; `"puck"` ships the raw
  `@puckeditor/core` `<Puck>` bit-for-bit identical to the prior
  release.
- **CSS sidecar** — `import "@anvilkit/core/styles.css"` exposes
  the `--ak-studio-*` token contract bridging to existing
  shadcn / Tailwind v4 tokens.
- **`createStudioOverrides`** factory and `studioOverrides`
  singleton at `@anvilkit/core/react/overrides` for hosts that
  need the preset directly (tests, tooling).
- **Per-instance editor stores** — `EditorUiStoreProvider`
  keyed by `storeId` (default `"default"`). Two `<Studio>`
  mounts on the same page no longer share UI state.
- **Pass-through props** for `ui`, `viewports`, `onAction` to
  `<Puck>`. When `chrome="anvilkit"`, `ui` is merged with the
  chrome's full-width-viewport defaults via `mergeStudioUi()`.
- **Header wiring slots** — `onBack`, `onSaveDraft`,
  `isSavingDraft`, `lastSavedAt`, `isPublishing` props for the
  default chrome's header.

### Changed

- **Visual change**: hosts upgrading without setting `chrome`
  see the AnvilKit Studio shell on first reload. To keep the
  prior look, pass `chrome="puck"`.
- `sideEffects` flipped from `false` to `["**/*.css"]` so the
  CSS sidecar isn't tree-shaken when consumers import it.
  Existing JS tree-shaking is preserved.

### Migration

- **Keep the new chrome (recommended)**: add the CSS imports to
  your app entry — `import "@puckeditor/core/puck.css"; import
"@anvilkit/core/styles.css";`. Optionally wire the new
  `onBack` / `onSaveDraft` / `isPublishing` props.
- **Stay on raw Puck**: pass `chrome="puck"` to `<Studio>`. No
  other changes required; bundle size unchanged.

### Bundle budget

- `<Studio>` entry chunk: **5,089 B gzipped** (down from
  5,535 B). Default preset and chrome layout load as separate
  async chunks; `chrome="puck"` ships none of them.

## 0.1.0-alpha.0 — 2026-04-10

### Added

- **Types** — `StudioPlugin`, `StudioPluginContext`,
  `StudioPluginRegistration`, `StudioPluginLifecycleHooks`,
  `StudioHeaderAction`, `StudioLogLevel`, `StudioConfig`,
  `ComponentPackageManifest`, `ExportFormatDefinition`, `ExportOptions`,
  `ExportResult`, `ExportWarning`, `ExportWarningLevel`, `PageIR`,
  `PageIRNode`, `PageIRAsset`, `PageIRMetadata`, and the
  `AiComponentSchema` / `AiFieldSchema` / `AiGenerationContext` /
  `AiValidationIssue` / `AiValidationResult` family.
- **Runtime** — `compilePlugins`, `createLifecycleManager`,
  `createExportRegistry`, `composeHeaderActions`, `isStudioPlugin`,
  `isPuckPlugin`, the `StudioError` / `StudioPluginError` /
  `StudioConfigError` / `StudioExportError` class family, and
  `CORE_VERSION`.
- **Config** — `StudioConfigSchema` (Zod), `createStudioConfig`,
  `parseStudioEnv`, `StudioConfigProvider`, `useStudioConfig`.
- **React** — `<Studio>`, `useStudio`, `mergeOverrides`,
  `useExportStore`, `useAiStore`, `useThemeStore`.
- **Compat** — `aiHostAdapter` at `@anvilkit/core/compat`
  (deprecated, tree-shakable; consumers who never pass `aiHost` ship
  zero adapter bytes).
- **Quality gates** — `check:publint`, `check:circular`,
  `check:react-free-runtime`, `check:peer-deps`,
  `check:bundle-budget` (25 KB gzipped firm budget on the `<Studio>`
  entry chunk), and `check:api-snapshot` (TypeDoc JSON pin).

### Notes

- **Alpha release.** The public API may change between
  `0.1.0-alpha.x` releases without a deprecation window. Consumers
  should pin to an exact version until `0.1.0` lands.
- **Zod loads lazily.** `createStudioConfig` is dynamically imported
  from inside `<Studio>` so Zod moves into an async chunk rather
  than the main entry. This is what keeps the entry bundle at
  ~4 KB gzipped even though the full config validator is Zod-heavy.
  If you import `@anvilkit/core/config` directly, Zod does load
  eagerly for that subpath.
- **`<Studio>` renders `null`** while the plugin graph compiles.
  Host apps that want a branded loading state should render one
  above `<Studio>` — no Suspense boundary is used internally.
