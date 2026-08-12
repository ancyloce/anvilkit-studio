---
"@anvilkit/canvas-core": patch
"@anvilkit/canvas-editor": patch
---

Motion and media are labelled contract-only (PLAN-0035 §5 P0, `cp0-001`,
`cp0-002`).

**No behaviour changed.** These packages advertised capability the build does
not have, and this closes the gap by disclosure rather than by implementation.

- **`@anvilkit/canvas-core`** gained a **built-in node-kind capability matrix**
  in its README covering all 16 kinds plus an animation row, with `Media
  support (video & audio)` and `Motion (animation is metadata-only)`
  subsections, and a TSDoc note on `CanvasAnimation`. The facts recorded, each
  with its greppable warning code: a `video` node exports its **poster still
  only** (`VIDEO_UNSUPPORTED`); an `audio` node exports **nothing, ever**
  (`AUDIO_UNSUPPORTED`); and `CanvasAnimation` is **never played and never
  exported** — there is no timeline, scrubber or authoring field anywhere, so
  the field is write-only from a host's point of view. The disclosure states
  the four-way split honestly rather than over-claiming: SVG warns per node
  **and** per page, PDF warns per page only, **PNG/JPEG/WebP warn nothing at
  all**, and `json` round-trips the metadata verbatim.
- **`@anvilkit/canvas-editor`** now *shows* it. Selecting a `video` or `audio`
  node used to render **no kind-specific inspector at all** — neither kind had
  a branch in the dispatch, so both fell through to the extension lookup and
  produced nothing. There is now a **Media** section carrying a badge and the
  kind-correct sentence, resolved entirely through message keys (four new
  `canvas.inspector.media*` keys in all four locales). The export capability
  matrix gained a motion row and a per-path section.
- **Fixed: a warning code that does not exist.** The editor's export capability
  matrix documented `ASSET_UNRESOLVED` for a missing or failed image/svg asset.
  No such code is emitted anywhere; the real one is `MISSING_ASSET`. A code a
  reader greps for and cannot find is exactly the failure this disclosure
  exists to prevent.
