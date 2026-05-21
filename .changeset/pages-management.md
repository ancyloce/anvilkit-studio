---
"@anvilkit/core": minor
---

Add multi-page management to `<Studio>`. Hosts can now wire rename,
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
