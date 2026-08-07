---
"@anvilkit/canvas-core": minor
---

Frame clip shapes: `CanvasFrameNode.shape` and the one resolver that reads it
(ADR 0008 decision 2, PLAN-0035 `cp4-001`).

Clipping already belongs to the container in Canvas IR, so the shape mask
extends `frame` rather than adding a second clipping model on the image node.

**Added, all additive and optional — no migration, and every existing document
parses and serializes unchanged:**

- `CanvasFrameShape` — the closed clip-geometry union (`rect`, `ellipse`,
  `polygon`, `star`, `path`), and `CanvasFrameNode.shape?: CanvasFrameShape`.
  **Absent means the rectangle frames have always clipped to.**
- `CanvasFrameShapeSchema` — a `discriminatedUnion` on `kind`, reusing the same
  side-count and unit-interval refinements the `polygon`/`star` nodes use.
- `resolveFrameClipShape(frame)` → `ResolvedFrameClipShape`, plus
  `FrameClipShapeSource` and `FrameClipDegradation`. This is the ONE frame-clip
  resolver: the Konva `clipFunc`, the SVG `<clipPath>` and the inspector all
  read it, so canvas, export and UI cannot disagree about what a frame clips
  to. It is pure and total — `clip` stays the only on/off switch, a declared
  shape wins over the inherited rectangle, `radius`/`cornerRadii` reach the
  result for `kind: "rect"` alone, and a shape this build cannot honour degrades
  to the rectangle instead of throwing.
- `CanvasInvariantIssueCode` gains `"unsupported-frame-clip-shape"`, the
  diagnostic for a degraded shape. The union only ever grows.

Nothing renders the new field yet: the SVG `<clipPath>` geometry (`cp4-002`) and
the Konva `clipFunc` geometry (`cp4-003`) follow, and both consume this
resolver rather than re-deriving the rules.
