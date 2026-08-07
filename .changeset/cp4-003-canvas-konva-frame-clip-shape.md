---
"@anvilkit/canvas-editor": minor
---

The live canvas and every raster export honour `CanvasFrameNode.shape` (ADR 0008
decision 2, PLAN-0035 `cp4-003`).

`cp4-001` added the field and the one resolver; `cp4-002` taught the SVG
serializer to read it. The Konva renderer now reads the same
`resolveFrameClipShape` — so a shape-clipping frame clips to its shape on the
stage, in PNG/JPEG/WebP export, and in PDF (which rasterizes each page through
this exact renderer before core embeds it).

**No new clipping mechanism, and no node caching.** A shaped frame emits the same
`clipFunc` on the same wrapping `<Group>` a rounded `clip` has emitted since
canvas-m1-003; only the path the callback traces changes, and every kind reuses
geometry that already shipped:

- `rect` — the declarative `clipX/Y/Width/Height` box, or a `roundRect` with the
  rounding the resolver normalized. Byte identical to the pre-ADR-0008 output,
  whether the shape is absent or an explicit `{ kind: "rect" }`.
- `ellipse` — `ctx.ellipse` at the box's inscribed radii, the same centre and
  radii core's `emitEllipse` computes.
- `polygon` / `star` — a polyline through `computePolygonVertices` /
  `computeStarVertices`, the same vertex maths the SVG `<polygon>` uses.
- `path` — a `Path2D` returned to Konva as `ClipFuncOutput`, so no SVG path
  parser is re-implemented. A `d` Konva's own parser yields no points for, or a
  DOM without `Path2D`, degrades to the frame box rather than clipping the
  frame's whole content away.

Alpha masking is **not** implemented: ADR 0008 decision 3 deprecates
`CanvasImageNode.maskAssetId` rather than finishing it, so there is no Konva
`cache()` and no `globalCompositeOperation: "destination-in"` anywhere on the
clip path — clipping allocates no offscreen canvas.

A `shape` on a frame whose `clip` is off stays inert, and a node's own
`blendMode` still composes: Konva pushes the clip before applying the composite
operation, so a frame carrying both blends into the backdrop *and* stays inside
its shape.
