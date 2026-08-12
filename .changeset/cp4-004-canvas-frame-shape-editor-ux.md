---
"@anvilkit/canvas-editor": minor
---

Frame clip shapes get controls, and the reposition overlay is fixed
(PLAN-0035 §5 P4, `cp4-004`). ADR 0008 decision 1, owner sign-off 2026-08-07.

`cp4-003` taught the canvas to *render* `CanvasFrameNode.shape`; this is how a
user reaches it.

- **New inspector *Shape* section on a frame** — a six-option picker (None,
  Rectangle, Ellipse, Polygon, Star, Custom path) with the per-kind parameters
  (`sides`, `points`, inner-radius ratio, path data), a **Release shape**
  button, and a status line for the two cases a user would otherwise read as a
  bug: a shape sitting on an unclipped frame (inert by contract), and geometry
  that could not be honoured (degraded to the frame box). Apply and release are
  each **one undo step**.
- **Two deliberate asymmetries, because the obvious symmetry breaks
  documents.** Applying a shape **turns `clip` on** — otherwise the picker
  would look broken, since a shape on an unclipped frame is inert. Releasing a
  shape **does not turn `clip` back off**: a cover-filled photo is wider than
  its frame by construction, so un-clipping on release would spill it across
  the page. Applying a shape to an **empty, placeholder-less** frame also makes
  it an image well, so "shape it, then drop a photo on it" works; a frame that
  already holds children is never promoted, because that would change what the
  next drop does to its content.
- **Repositioning the photo inside a shaped well is discoverable.**
  Double-clicking a filled, clipping image well opens the reposition editor
  (ordered ahead of isolation entry — every other container still isolates),
  and a **Reposition image** button in the inspector calls the identical path
  for anyone who does not find the gesture. Changing the shape never discards a
  deliberate reposition, and repositioning never alters the shape; only an
  image that would not be visible at all (zero area, non-finite placement, no
  overlap with the frame box) is restored to cover geometry.
- **Fixed: the reposition overlay was mis-anchored for every nested image.** It
  read the node's parent-local transform instead of composing its ancestors, so
  the handles landed in the wrong place for *every* image inside a well — which
  is every well photo there is.
- **The drop zone says what you are about to fill:** `data-drop-target-shape`
  carries the hovered well's resolved clip kind, alongside a "Drop to fill
  shape" badge.
- **`{ kind: "path" }` data is in the frame's LOCAL units**, not page units.
  The picker seeds a fresh path from the frame's own box for that reason; a
  size-independent default would land off-box on every frame but one.
- **Public surface (additive, source-compatible):** `ToolContext.cropStore`
  (optional) and `BeginCropContext`, exported from `./internal`. 16 new
  `canvas.inspector.frameShape*` / `canvas.inspector.repositionImage` /
  `canvas.upload.replaceTargetShape` keys in all four locales.
- **No alpha masking exists or is planned.** ADR 0008 decision 3 deprecates
  `CanvasImageNode.maskAssetId` instead; masking lives on the frame.
