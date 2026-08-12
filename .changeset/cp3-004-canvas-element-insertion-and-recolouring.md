---
"@anvilkit/canvas-editor": minor
---

Element insertion and recolouring (PLAN-0035 §5 P3, `cp3-004`, `cp3-005`).

The second half of the Elements panel restructuring announced in
`cp3-003-elements-panel-content-surface.md`: the catalog is now insertable, and
what lands on the canvas is editable with the ordinary inspector controls.

- **Two gestures, one implementation.** Click (or Enter/Space — the cells are
  real buttons) inserts at the **viewport centre**; dragging a cell onto the
  canvas inserts at the **drop point**, parented into the frame under the
  cursor and slotted into its Auto Layout flow when it has one. Both commit
  exactly **one `node.create`** — a 22-part sticker group included, so undo
  removes it in a single step — and select the new node, matching every other
  insertion path in the editor.
- **No parallel drop path.** The drag rides `<CanvasDropZone>`'s existing
  handlers as one extra MIME type; no new `onDrop`, drop container,
  drop-target resolver or screen→page mapping was added. An element drag
  deliberately suppresses the photo "Drop to replace" affordance, which would
  otherwise light up over an image the drop is never going to touch.
- **New public exports:** `insertCanvasElement`, `insertElementAtPoint`,
  `insertElementAtViewportCenter`, `CanvasElementInsertOptions`. They exist
  because `ElementsPanelProps.onSelect` **overrides** the built-in insert
  rather than observing it (which is what an element *picker* needs) — a host
  that wants both its own handler and the default behaviour calls
  `insertElementAtViewportCenter(ctx, entry)` itself.
- **New runtime contract:** `PagesCanvas`'s scroll element now carries
  `data-canvas-viewport`, so "the visible box in client space" is locatable.
  It is a runtime marker, not a testid — renaming it is a product break.
- **Recolouring needed no new control.** Every catalog entry builds real IR
  geometry (`path`/`group`/`rect`/`ellipse`/`polygon`/`star`/`line`/`frame`),
  so each already lands on an existing inspector section, and no entry bakes in
  a colour — proven three ways across all 425 entries, including through the
  SVG exporter. Fills accept a brand token and it stays unresolved in the node,
  so an inserted icon is brand-token-aware from the first frame.
- **Multi-colour stickers say what they are.** A `group` has no fill in the IR,
  so no single control could ever repaint one part of a sticker. Rather than
  leave that as an absence a user reads as a missing feature, the Group
  inspector section now carries a note — *"A group has no color of its own.
  Select a part to recolor it."* — one new key, all four locales.
- **If insert-time colouring is ever added, it must branch on `entry.recolor`.**
  Passing a fill to one of the 22 `multi` entries seeds only the marked parts,
  which is exactly the half-painted result the contract exists to prevent.

**Known cosmetic imprecision, not fixed here.** The panel derives a preview's
stroke width as 6.25% of its viewBox, which is exact for the 156 outline icons
and wrong for the 25 `line` entries (authored at ~1.67%), so line thumbnails
draw ~3.75× heavier than the node they insert and `line-plain` / `line-thick`
draw alike. The **inserted node, its inspector controls and its export are all
correct**; only the thumbnail is off. The fix is an additive optional
`strokeWidth` on the element preview contract.
