# `src/state/` — Studio instance state

The **single home for all per-`<Studio>`-instance state** (merged from the old
`react/stores/` + `react/studio/state/`). Consumed via the `@/state` alias —
most callers import the barrel (`@/state`); a few deep-import
`@/state/slices/<x>` etc.

## Layout

```
state/
  index.ts                     barrel (the stable import surface)
  README.md   __tests__/

  ── composite + infra (what the <Studio> controller mounts) ──
  editor-store-bundle.ts       createEditorStore — bundles the 5 slices below
  EditorStoreProvider.tsx      single hydration gate supplying the 5 slice contexts
  use-rehydrated-store.ts      zustand/persist rehydration helper (used by every provider)
  devtools.ts                  devtoolsEnabled — store devtools gate

  slices/                      ── the 5 persisted Studio-instance Zustand slices ──
    ai-store.ts          AiStoreProvider.tsx        (Core-owned, chrome-agnostic)
    export-store.ts      ExportStoreProvider.tsx    (Core-owned, chrome-agnostic)
    theme-store.ts       ThemeStoreProvider.tsx     (Core-owned, chrome-agnostic)
    locale-store.ts      LocaleStoreProvider.tsx    (Core-owned, chrome-agnostic)
    editor-ui-store.ts   EditorUiStoreProvider.tsx  editor-ui-selectors.ts  (AnvilKit chrome)

  sidebar-registry/            ── plugin sidebar registry (store + hook + provider) ──
    sidebar-registry-store.ts  use-sidebar-registry.ts  SidebarRegistryProvider.tsx

  ── chrome i18n context (NOT a store — see "Not state" below) ──
  editor-i18n-context.tsx
```

## Where does a new file go?

| If it is… | Put it… |
|---|---|
| A **Core-owned, chrome-agnostic** slice (works on the legacy `chrome="puck"` path) | `slices/<name>-store.ts` + `<Name>StoreProvider.tsx`; persist key `anvilkit-core-<name>-${storeId}` |
| **AnvilKit-chrome** UI state | `slices/` (e.g. extend the editor-ui slice or add a chrome slice) |
| Something composing the slices behind one gate | root (next to `editor-store-bundle.ts` / `EditorStoreProvider.tsx`) |
| Plugin sidebar registry wiring | `sidebar-registry/` |

The composite vs. one-slice distinction (`editor-store-bundle` vs.
`editor-ui-store`) is disambiguated **by location** — the composite is at the
root, each slice lives in `slices/`.

## Not state (eviction candidates)

The non-state files swept in during the merge have been evicted to `studio/`:
`StudioRootProvider.tsx` → `studio/context/`, and `insert-component-node.ts` /
`use-insert-snippet.ts` / `use-text-selection.ts` → `studio/layout/sidebar/commands/`.

`editor-i18n-context.tsx` (i18n message context) is the **one remaining
non-state holdout** — it's a chrome context, not a store, and ideally belongs
under `studio/i18n/`, but it has ~46 importers so the move was deferred.

## Write path

Plugins **never** import these hooks. State is written by `<Studio>`
subscribing to lifecycle events and calling the store setters (`core-013`).
