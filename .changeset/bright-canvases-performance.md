---
"@anvilkit/canvas-editor": minor
"@anvilkit/canvas-core": minor
---

Add content-free interaction phase instrumentation across Canvas resolution,
layout, stage rendering, thumbnails, and commits, and coalesce rapid preview
writes into one latest-value resolution per animation frame. Incremental
resolution now retains untouched pages and limits geometry work to dirty nodes,
Auto Layout constraint closures, and dependent component instances. Thumbnail
invalidation is deferred during active direct manipulation and flushed once
the interaction settles. At 1,000 and 5,000 resolved nodes, deterministic
large-document policies progressively batch thumbnail rasterization and omit
live blur/shadow work only while direct manipulation is active.
Add fixed 100/1,000/5,000-node and text/image/component-heavy performance
fixtures with median/p95 CI reporting, absolute frame budgets, and an initial
15% normalized regression gate.
