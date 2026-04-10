# @anvilkit/core

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
