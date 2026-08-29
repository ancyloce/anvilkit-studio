---
"@anvilkit/canvas-core": minor
"@anvilkit/canvas-editor": minor
---

Make Canvas exports bounded, cancelable, and consistently diagnosable.

`@anvilkit/canvas-core` now provides a unified export-cost estimator,
configurable hard-limit checks, stable export diagnostics, pure print
preflight, and incremental cancellable PDF raster handling. Print preflight
reports DPI, bleed, margin, safe-area, image-resolution, font, and unsupported
effect findings before raster allocation.

`@anvilkit/canvas-editor` now supports `pdf-print` across its public format
types, default exporter registry, dialog, legacy menu, and headless action. All
built-in export entry points enforce the same limits, carry normalized
diagnostics, release PDF page rasters incrementally, preserve the
`.print.pdf` filename, and leave document/undo state untouched on failure.

The worker feasibility decision retains the one-page-at-a-time browser path:
costing and print preflight are worker-safe, while React-Konva rasterization
requires DOM/font/browser encoder APIs and moving PDF assembly alone would
regress the bounded-memory contract.
