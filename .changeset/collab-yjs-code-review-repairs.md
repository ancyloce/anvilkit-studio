---
"@anvilkit/plugin-collab-yjs": patch
---

Code-review repairs for the `0.10.0-rc.1` static analysis.

**Correctness**

- **R1** — `IndexedDbBackend.drain()` is now atomic: it reads and
  clears in a single `readwrite` cursor transaction, so the set
  returned is exactly the set deleted. An `append()` racing a drain
  can no longer be wiped without being handed back (silent
  offline-edit loss on reconnect).
- **R2** — Offline-queue compaction is crash-safe. New
  `StorageBackend.compact(merge)` appends the merged blob and durably
  commits it **before** deleting the source rows; a crash mid-
  compaction leaves a recoverable superset, never an empty store.
- **R3** — `load()` throws typed errors — `SnapshotNotFoundError`,
  `SnapshotPrunedError`, `SnapshotCorruptedError` (all exported) — so
  a history UI can distinguish a snapshot pruned by the `maxSnapshots`
  retention cap from a missing or corrupted one and degrade
  gracefully. Message text and `instanceof Error` are preserved.

**Maintainability / hardening**

- **A1** — `ROOT_DROPPABLE_ID` and the Puck structural shapes are
  consolidated into a single internal `puck-shapes` module with a
  compile-time `@puckeditor/core` drift assertion, replacing a
  comment-maintained cross-module invariant.
- **R5** — Grace-window, pending-sweep, conflict-staleness and
  awareness token-bucket windows use the monotonic `nowMs()` clock; a
  wall-clock step can no longer skew these correctness windows.
- **T4** — Dropped the redundant `strictNullChecks` and the
  `ignoreDeprecations` suppression from `tsconfig.json`; resolved the
  underlying deprecation by removing the unused `baseUrl`.

**Performance**

- **P1** — Reorder / insert / delete no longer forces every connected
  peer to re-parse the whole document. The adapter emits a structured
  relink delta and the live-IR cache relinks only affected subtrees;
  local saves apply O(changed) instead of walking the full tree. The
  full rebuild remains the proven correctness backstop and the
  Puck-side dispatch for topology changes is byte-identical to before.
- **P2** — Save-time classification uses one cached per-node content
  hash per next-node instead of stringifying every node's
  props/assets/meta on both sides each keystroke.
  `SnapshotMeta.pageIRHash` keeps its `hashIR(encodeIR(ir))`
  definition — unchanged, no cross-version concern.

No public-API breaking changes. See the README "Performance
characteristics" section for the residual O(document) save floor and
the deferred tail costs gated by `pnpm bench:collab-highload`.
