---
"@anvilkit/canvas-core": minor
---

SVG export honours `CanvasFrameNode.shape` (ADR 0008 decision 2, PLAN-0035
`cp4-002`).

`cp4-001` added the field and the resolver; nothing rendered it. The SVG
serializer now does, so a shape-clipping frame exports as the shape it clips to
instead of a rectangle.

**No new clipping mechanism.** A shaped frame emits the same `<clipPath>` over
the same `<g>`, under the same `frame-clip-<node-id>` id, that a rectangular
`clip` has emitted since canvas-m1-003 — only the child of that `<clipPath>`
changes, and every kind reuses geometry that already shipped:

- `rect` — the frame box, with the rounding the resolver normalized. Byte
  identical to the pre-ADR-0008 output, whether the shape is absent or an
  explicit `{ kind: "rect" }`.
- `ellipse` — an `<ellipse>` at the box's inscribed radii, as `emitEllipse`
  computes them.
- `polygon` / `star` — a `<polygon>` from `computePolygonVertices` /
  `computeStarVertices`, the same vertex maths `emitPolygon` / `emitStar` use.
- `path` — a `<path>` whose `d` must pass `PATH_D_RE`, the same allowlist
  `emitPath` applies. `cp4-001` deliberately left path data uncharacter-checked
  in the IR layer; this is where that guard runs.

An honoured shape carries **no** fidelity warning, for the same reason a
rectangular clip never has: it is losslessly representable. A shape on an
unclipped frame stays inert, including for the background.

**Added:** `SvgWarningCode` gains `"FRAME_CLIP_SHAPE_DEGRADED"` — the union only
ever grows, so no consumer switching on it breaks. It fires only for residue
that genuinely cannot be drawn (a `kind` this build does not implement, numbers
describing no outline, or rejected `path` data), after which the frame still
clips to its box and the document keeps its field.

**Unchanged:** `IMAGE_MASK_UNSUPPORTED` and the image node's `maskAssetId`. ADR
0008 decision 3 deprecates that field rather than implementing it, so there is
no `<mask>` emission and the warning survives — masking lives on the frame.
