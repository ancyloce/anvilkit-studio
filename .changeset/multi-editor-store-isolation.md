---
"@anvilkit/core": minor
---

**BREAKING:** Per-instance store isolation for multi-editor pages (review finding H3).

The `useThemeStore` / `useExportStore` / `useAiStore` exports are no longer
module-level Zustand singletons. They are now per-`<Studio>` instances behind
context providers, mirroring `createEditorUiStore`:

- New factories `createThemeStore` / `createExportStore` / `createAiStore`,
  providers `ThemeStoreProvider` / `ExportStoreProvider` / `AiStoreProvider`,
  and `useThemeStoreApi` / `useExportStoreApi` / `useAiStoreApi` accessors.
- `useThemeStore(selector)` / `useExportStore(selector)` /
  `useAiStore(selector)` keep the same call shape but now read the active
  context store and **must be called inside a `<Studio>`**. The previous
  static surface (`.getState()` / `.setState()` / `.persist`) is gone — use a
  store instance (via `useXStoreApi()` or `createXStore()`) instead.
- Persistence keys are namespaced per `storeId`
  (`anvilkit-core-{theme,export,ai}-<storeId>`); when the host omits
  `storeId`, `<Studio>` derives a stable per-instance fallback from
  `useId()` instead of the old shared `"default"`.
- Iframe DOM queries in theme sync and the layer splitter are scoped to each
  Studio's root subtree (new `StudioRootProvider`), so two editors on one page
  no longer target the first `iframe#preview-frame`.

Two `<Studio>` instances on the same page now have fully independent theme,
export, and AI state. This executes the store-factory work previously
documented as deferred in `react/stores/index.ts`.
