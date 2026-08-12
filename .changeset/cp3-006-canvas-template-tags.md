---
"@anvilkit/canvas-editor": minor
---

Template tags: an optional field, a search facet, and chips in the panel
(PLAN-0035 §5 P3, `cp3-006`).

- **`CanvasTemplateEntry.tags` is now optional.** It was required (inherited
  from `CanvasTemplateDefinition`) and the provider spread it unguarded, so a
  host catalog whose entries simply omit the key **threw**. This is a pure
  widening — every catalog that satisfied the old shape still satisfies this
  one — and an untagged catalog now lists, free-text searches, filters by
  category and size, and paginates without error.
- **New search facet `CanvasTemplateSearchQuery.tags?: readonly string[]`** —
  **AND**-matched (an entry must carry every listed tag), case-insensitive and
  whitespace-trimmed through the new exported `normalizeTemplateTag`, and
  composable with `category`, `text`, `size` and the offset cursor.
- **The Templates panel renders tags as toggle chips**, with the active tag
  echoed in a filter row carrying its own clear button — without that row, a
  facet matching nothing would remove the only affordance to undo it along with
  the results. Untagged entries render no chip row at all. Three new
  `canvas.templates.tag*` keys in all four locales.
- Free-text search already reached tags; it now does so safely on entries that
  have none.
