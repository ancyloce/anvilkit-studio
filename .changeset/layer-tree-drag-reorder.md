---
"@anvilkit/core": minor
---

Add drag-and-drop reordering to the Studio Layers panel.

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
