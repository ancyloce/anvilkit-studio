---
"@anvilkit/canvas-editor": minor
---

Font catalog and the `fontCatalog` prop (PLAN-0035 §5 P2, `cp2-001`…`cp2-007`).

Font choice used to have no source beyond `brandKit.fonts` — a free-text box
wherever a host configured none.

- **`DEFAULT_FONT_CATALOG`: 37 open-licensed families**
  (`sans 9 · serif 7 · slab 5 · mono 6 · display 5 · handwriting 5`), each with
  an SPDX id transcribed from that family's `google/fonts` `METADATA.pb`
  (36 × OFL-1.1, 1 × Apache-2.0), an upstream URL, and real weight / italic /
  subset metadata. A test fails any entry whose licence falls outside
  `OPEN_FONT_LICENSES`.
- **A real picker.** `FontPickerField` groups **Brand → Recent → Catalog** with
  a category filter and diacritic-folding search, previews each option in its
  own face **only when that option is on screen** (~8 stylesheet loads on open,
  not 37), and keeps a **Custom** row so a family the catalog has never heard
  of can still be typed by hand. Picking a brand family commits a brand
  **token**, not a flattened literal. Recent picks persist (cap 8, most-recent
  first, case-insensitive identity) in the existing workspace store.
- **New prop `fontCatalog?: CanvasFontCatalog`** (`CanvasStudioProps`,
  inherited by `CanvasWorkspaceProps`; optional). The editor resolves
  `mergeCatalogs(DEFAULT_FONT_CATALOG, fontCatalog)` **once** and hands the same
  object to the picker *and* to the SVG export `@font-face` manifest — one
  catalog, two consumers, so "the picker offered it but the export ignored it"
  cannot happen. Precedence is **brand > host > default** and rides on each
  record's `origin`, **not** on argument order, so no call site can get the
  order wrong. A duplicate family is replaced whole-entry, never field-merged,
  so an entry can never inherit another entry's licence.
- **SVG export derives the manifest for you** from the catalog ∩ the families
  the page actually paints, skipping any entry with no resolvable `src` rather
  than emitting a broken rule. Precedence is
  `createSvgExporter({ fonts })` → `createSvgExporter({ fontCatalog })` →
  `CanvasExportContext.fontCatalog`; with none of the three, output is
  byte-identical to before. `CanvasExportContext` gained an additive optional
  `fontCatalog`.
- **New public exports (19):** `DEFAULT_FONT_CATALOG`, `createFontCatalog`,
  `mergeCatalogs`, `CANVAS_FONT_CATEGORIES`, `resolveFontCatalog`,
  `useCanvasFontCatalog`, and 13 catalog types. 16 new `canvas.fontPicker.*`
  keys in all four locales.

**⚠️ The default catalog ships metadata, not font bytes.** Every default entry
is a version-pinned Google Fonts *stylesheet URL* with no `source.files`. Two
consequences, both deliberate: those families **need network access** to render
(offline hosts get the first-class `"fallback"` font status, not an error), and
an **SVG export emits no `@font-face` rule** for any of them — a stylesheet URL
is not a usable `@font-face` `src`, and inlining an `@import` would make the
exported SVG depend on a network fetch. To embed a family, give its catalog
entry a `source.files` pointing at real font files; prefer a variable file,
because core emits at most one `@font-face` per family. `fontCatalog` extends
the default catalog and **cannot remove** a default family. Full detail:
`docs/typography.md`.
