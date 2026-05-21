# @anvilkit/core

## 1.0.0

### Minor Changes

- 1132913: Add an optional `signal?: AbortSignal` parameter to `StudioAssetSource.upload()`.

  The sidebar image module now creates an `AbortController` per upload batch and
  aborts it on unmount / source change, so an in-flight upload stops consuming the
  host endpoint when the editor navigates away. The parameter is optional and
  backward compatible — existing sources that ignore it keep working unchanged.

- 3fb8db9: Add the additive core surface that lets `@anvilkit/plugin-design-system`
  contribute a design-system rail panel and `--ak-ds-*` token vocabulary
  to hosts that install the plugin. Source-compatible — hosts that don't
  load the plugin see no behavioural change.

  **Plugin context — new optional callback:**
  - `StudioPluginContext.registerDesignSystemPanel?(panel)` mirrors the
    existing `registerCopilotPanel?` / `registerHistoryPanel?` shape:
    single-occupancy, last-write-wins, idempotent unregister, no
    panel UI rendered until a plugin registers one. Returns a
    `StudioSidebarUnregister` for cleanup in `onDestroy`.

  **Sidebar registry store — new slot:**
  - `sidebarRegistryStore.designSystemPanel: StudioDesignSystemPanel | null`
    with matching `registerDesignSystemPanel(panel)` setter (matches
    the copilot/history pattern; capture-and-clear-only-if-still-current).

  **Token CSS plumbing — new `--ak-ds-*` two-tier block:**
  - `packages/core/src/react/overrides/styles.css` declares
    primitive ramps (`--ak-ds-brand-{50…900}`,
    `--ak-ds-neutral-{50…900}`), spacing scale
    (`--ak-ds-space-{0,1,2,3,4,6,8,12,16,24}`), type ramp
    (`--ak-ds-text-{xs,sm,base,lg,xl,2xl,3xl}`), radius scale, plus
    semantic vars (`--ak-ds-bg`, `--ak-ds-surface`, `--ak-ds-fg`,
    `--ak-ds-fg-muted`, `--ak-ds-accent`, `--ak-ds-accent-fg`,
    `--ak-ds-border`, `--ak-ds-focus-ring`). Each semantic falls back
    to its `--ak-studio-*` chrome equivalent so unthemed hosts render
    unchanged.
  - `packages/core/src/react/studio/theme/iframe-theme.ts` mirrors the
    same declarations into `TOKEN_BLOCK` so host doc + Puck canvas
    iframe stay in lockstep on theme changes.
  - `.dark` overrides primitives only — semantics and persisted token
    refs are theme-stable.

  **Type re-exports:**
  - `StudioDesignSystemPanel` from `@anvilkit/core/types` parallels
    `StudioCopilotPanel` / `StudioHistoryPanel`.

  **No behavioural change for hosts that don't install the plugin.**
  The new optional context callback, sidebar-registry slot, and CSS
  variables are purely additive. Existing `--ak-studio-*` chrome
  vocabulary is untouched.

  **Known gap:** the rail tab + sidebar module that _renders_
  `sidebarRegistryStore.designSystemPanel` has not yet landed — a
  follow-up will add `"design-system"` to `EditorTab` and the
  `RAIL_MODULES` table so the panel is reachable from the UI.
  Registering a panel today populates state that no UI consumes; the
  plugin's other contributions (`--ak-ds-*` CSS, token-bound field
  factories, validators) work independently of the rail panel.

- 8e74a25: Add drag-and-drop reordering to the Studio Layers panel.

  The Layers panel previously delegated the whole component tree to Puck's
  opaque `<Puck.Outline />`, which exposed no drag interaction or visual
  feedback. It now renders a `@dnd-kit`-powered tree (`LayerTree`) built
  from a reactive projection of Puck state:
  - Drag a layer to reorder it within its zone (`reorder`) or into another
    component's zone (`move`), with a pointer-first collision strategy.
  - Clear feedback while dragging: a drag overlay, an accent insertion
    line on the hovered row, and a highlight on the target zone.
  - Dropping a component into its own descendant zone is rejected (cycle
    guard); source/destination indices are re-resolved from
    `getSelectorForId` at drop time so concurrent edits can't corrupt the
    move.
  - Accessibility: pointer + keyboard sensors, ArrowUp/ArrowDown reorder
    on the focused grip, and screen-reader announcements.
  - Selection and outline expand/collapse remain wired to Puck's
    `itemSelector` and the existing `outlineExpanded` UI store; the
    `LayersPanel` props and quick-add behavior are unchanged.

  `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` are added
  as runtime dependencies. They load as async chunks, so the `<Studio>`
  runtime entry budget is unaffected; the aggregate `dist/index.js`
  size-limit tracker was lifted 550 KB → 560 KB to absorb the surface.

- 8e74a25: **BREAKING:** Per-instance store isolation for multi-editor pages (review finding H3).

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

- 44a683d: Add multi-page management to `<Studio>`. Hosts can now wire rename,
  delete, duplicate, drag-reorder, per-page settings, and SEO metadata
  through new optional callbacks on `StudioPagesSource` — each
  affordance is capability-gated, so hosts opt in by implementing the
  matching callback. Search is always available (UI-only). Nothing
  existing is forced; sources that only implemented
  `list / subscribe / onSelect / onCreate` continue to compile and
  render unchanged.

  **New optional callbacks on `StudioPagesSource`:**
  - `onRename(input)` — inline `Input` on the row; Enter commits, Esc
    cancels, blur commits, host errors echo inline.
  - `onDelete(pageId)` — row menu → confirm dialog (danger button via
    the `--ak-pages-danger-*` token).
  - `onDuplicate(pageId)` — row menu item. **Sole exception to "no
    optimistic mutation":** may return the created `StudioPage` so the
    UI can pre-select it before the `subscribe` round-trip lands.
  - `onReorder(input)` — drag handle on row hover; keyboard reorder via
    Space + Arrow + Space (the `@dnd-kit` accessibility recipe);
    screen-reader announcements wired.
  - `onUpdateSettings(input)` — opens `PageSettingsDialog` with
    prefilled fields for title / path / route / description, plus an
    SEO section (metaTitle / metaDescription / ogImage / noindex). The
    dialog ships a diffed payload — only changed fields are sent.

  **New optional `StudioPage` fields:**
  - `description?: string` — surfaced in the settings dialog.
  - `seo?: StudioPageSeo` — `{ metaTitle?, metaDescription?, ogImage?,
noindex? }`.
  - `order?: number` — advisory; `list()` order is still authoritative.
  - `locked?: boolean` — suppresses Rename + Delete affordances on the
    row regardless of callback presence.

  **Brand token surface:** scoped `--ak-pages-*` tokens (primitive +
  semantic tiers) for the panel surface; semantic tokens chain through
  to `--ak-studio-*`, then to shadcn theme vars, so unthemed hosts
  render correctly. Dark mode overrides primitives only.

  **Behavioural change — Home icon:** `PageRow` previously selected the
  Home icon via a legacy `page.id === "home"` string heuristic. It now
  derives from `StudioPage.locked === true`. Hosts that want the Home
  icon on their root page must mark it `locked: true` (which also
  correctly suppresses Rename + Delete on that page — matching the
  typical "Home is not renamable" intent). Hosts that previously
  relied on the id-based heuristic without setting `locked` will see
  the row render with the generic icon instead.

  **No new dependencies.** `@dnd-kit/core`, `@dnd-kit/sortable`, and
  `@dnd-kit/utilities` are already loaded for the layer tree.

  **Bundle size:** measured at ~373 KB gzipped against the 560 KB
  budget — no headroom bump needed.

- 1132913: Code-review remediation for the `0.1.2` static analysis of
  `@anvilkit/plugin-version-history` (see
  `docs/code-review/plugin-version-history-review-20260519104200.md` for
  the originating findings).

  **`@anvilkit/plugin-version-history`**
  - **Storage** — `localStorageAdapter` and `inMemoryAdapter` now share a
    delta-chain store: every `KEYFRAME_INTERVAL`-th save is a full
    keyframe and the snapshots in between are stored as the `IRDiff` from
    the previous record (with the snapshot's own `assets`/`metadata`
    carried verbatim, since `diffIR` does not model those). `load` walks
    `base` pointers to the nearest keyframe and replays the diffs with
    `applyDiff`. A delta is only accepted when a real structural
    equality check on the reconstructed candidate matches the input, so
    reconstruction is byte-for-byte lossless. Snapshots written by older
    versions are raw `PageIR` JSON and are read transparently as
    keyframes — no migration required.
  - **Eviction safety** — Deleting a snapshot that other deltas chain
    back to plans the keyframe-promotions in memory first, frees the
    target record's bytes, then writes the (strictly larger) full
    replacements. If a write fails (e.g. `STORAGE_QUOTA_EXCEEDED` mid-way
    through promotion), the original target is restored so the chain
    remains reconstructable.
  - **`deepEqual` (`diff.ts`)** — Rewritten as order-insensitive key-set
    compare (O(n) instead of O(n log n) per node) with a `seen` pair-map
    cycle guard so untrusted cyclic prop values cannot infinite-loop.
    Semantics are unchanged; the `applyDiff` `before`-state checks and
    the 500-case `diffIR` round-trip property still hold.
  - **Hash** — `hashPageIR` widened from a 32-bit FNV-1a fingerprint
    (~50% collision risk at ~65 k snapshots) to four independent 32-bit
    lanes (128-bit, collision risk negligible). The value remains an
    opaque string — width is not part of the contract, and old 8-char
    hashes from prior versions remain valid strings.
  - **`assertPageIR` (`adapters/local-storage.ts`)** — Now an
    `asserts value is PageIR` predicate, removing the fragile
    `as unknown as PageIR` double-cast.
  - **UI hardening** — Snapshot timestamps render through a new
    `useFormattedTimestamp` hook that returns the raw ISO during the
    first render (matching the server payload) and the localized value
    after mount; if `iso` changes the render path returns the new ISO
    immediately so no paint shows a stale localized timestamp.
    `SnapshotHistoryModal` migrated from the hand-rolled overlay to the
    shared `@anvilkit/ui` `Dialog`, picking up focus-trap, scroll-lock,
    `Escape`, and focus-restoration. `handleRestore` is now `try/finally`
    - mounted-ref guarded so the disabled button can never get stuck
      after a slow restore unmounts the modal.
  - **Collab cache invalidation** — `VersionHistoryUI` now wires the
    optional `SnapshotAdapter.subscribe(onUpdate)` callback to clear its
    in-memory snapshot cache and re-list, so a remote-update from a
    collaborative adapter never renders a stale diff.
  - **Opt-in type advertising** — `createVersionHistoryPlugin` now
    returns `StudioPluginContributing<VersionHistoryContribution>` via
    the new `defineStudioPlugin` helper, so consumers can recover the
    contributed adapter/snapshot types from a plugins array using
    `InferPluginContributions<typeof plugins>`.

  **`@anvilkit/core`** (additive, type-only)
  - New `StudioPluginContributing<Contributes>` sub-interface, branded
    with a module-private `unique symbol` so it lives in its own
    property namespace and leaves the base `StudioPlugin` shape (and
    variance) untouched.
  - New `defineStudioPlugin<Contributes>(plugin)` helper that performs
    the (unavoidable) type-only cast in one place.
  - New `InferPluginContributions<Plugins>` mapped-tuple helper that
    distributes over a plugins tuple, picks up the branded `Contributes`
    union from each `StudioPluginContributing` element, and collapses
    everything else (raw `StudioPlugin`, `PuckPlugin`, …) to `never`.
    The brand on the conditional is **required**, so an unbranded
    `StudioPlugin` cannot pollute the inferred union with `unknown`.
  - New `StudioAnyPlugin<UserConfig>` alias.
  - No runtime change, no `coreVersion` bump required — existing plugin
    shapes, `register` signatures, and the frozen 0.1.x contract are
    preserved.

  No breaking changes. All adapter-contract, diff property (500 fuzz +
  200 meta-only), legacy back-compat, delete-re-root, eviction, and
  core type-inference tests pass.

### Patch Changes

- 8e74a25: Fix `isCoreVersionCompatible` rejecting stable installs against a
  prerelease-tagged caret/tilde lower bound.

  `satisfiesCaret` / `satisfiesTilde` treated "the range's lower bound
  carries a prerelease" as "only same-`[major,minor,patch]`-tuple versions
  may match". That is not the npm/semver rule: a prerelease tag restricts
  the _version under test_ when it is itself a prerelease, never a stable
  release inside the range window. So `^0.1.0-alpha` wrongly rejected the
  stable install `0.1.3`, and any plugin declaring such a `coreVersion`
  (e.g. the demo's `anvilkit-demo-smoke-test`) failed compilation with
  `Plugin "..." requires @anvilkit/core "^0.1.0-alpha" but the installed
version is "0.1.3"`, leaving `<Studio>` rendering nothing.

  The prerelease admission rule is now factored into `prereleaseAllowed`
  and applied after the normal lower/upper bound checks, matching npm
  `semver.satisfies` across a full caret/tilde × version parity sweep
  (190 combinations, zero mismatches). Upper-bound behavior is unchanged
  — `^0.1.0-alpha` still excludes `0.2.0`/`0.2.0-alpha`.

- 8e74a25: Fix `<Studio>` swallowing the real error on plugin compilation failure.

  `writeStudioLog` passed `Error` instances straight through to host
  loggers and `console`. `Error`'s `name`/`message`/`stack`/`cause` are
  non-enumerable own properties, so any serialization of the log meta (the
  Next.js dev overlay, `JSON.stringify`-based host loggers, copy-pasted
  bug reports) collapsed the error to `{}` — surfacing only the useless
  `[studio] plugin compilation failed {}`.

  `redactLogMeta` now normalizes `Error` values to a plain, fully
  enumerable `{ name, message, stack, cause }` shape, recursing into
  `cause` (depth-bounded) so wrapper errors like
  `StudioPluginError("Plugin \"x\" failed to register")` no longer hide
  the developer-facing root reason. Secret-key redaction is unchanged.
  - @anvilkit/utils@1.0.0
  - @anvilkit/ui@1.0.0

## 0.1.3

### Patch Changes

- 2438917: Fix `TypeError: e.getModifierState is not a function` crash on browser form
  autofill. base-ui's Composite root (`Menu`, `Menubar`, `DropdownMenu`,
  `NavigationMenu`, `Toggle`, …) calls `event.getModifierState(key)` with no
  guard; Chrome/Edge autofill dispatches a `keydown` lacking that method, which
  crashed the app. Patched all base-ui packages in the dependency tree
  (`@base-ui/react@1.3.0`, `@base-ui/react@1.4.1`,
  `@base-ui-components/react@1.0.0-rc.0`) via pnpm `patchedDependencies` to guard
  the call (`typeof event.getModifierState === 'function' && …`), matching the
  fix shipped by VSCode/monaco for the same browser behavior.
- Updated dependencies [2438917]
  - @anvilkit/ui@0.1.3
  - @anvilkit/utils@0.1.3

## 0.1.2

### Patch Changes

- Add `registerHistoryPanel` slot to the StudioSidebar.

  `StudioPluginContext` gains an optional `registerHistoryPanel(panel)`
  method that mirrors the existing `registerCopilotPanel`: single panel
  per `<Studio>` mount, last-write-wins, returns an `unregister()` handle.
  The sidebar gets a sixth rail tab (`history`, clock icon) that renders
  the registered panel body or shows the `studio.module.history.empty`
  empty state.

  Integration packages paired with `@anvilkit/plugin-version-history`
  (or hosts that own their own snapshot UI) can now mount a sidebar
  panel without forking core. Pattern matches the existing copilot slot:

  ```ts
  ctx.registerHistoryPanel?.({
    render: () => <VersionHistoryUI adapter={adapter} currentIR={ir} onRestore={restore} />,
  });
  ```

  The persisted `EditorTab` schema bumps from version 2 to 3. The
  existing `migrate` callback already coerces unknown `activeTab` values
  to the default via `VALID_ACTIVE_TABS`, so older payloads land on the
  default tab without manual intervention.
  - @anvilkit/utils@0.1.2
  - @anvilkit/ui@0.1.2

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
