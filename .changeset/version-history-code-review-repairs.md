---
"@anvilkit/plugin-version-history": minor
"@anvilkit/core": minor
---

Code-review remediation for the `0.1.2` static analysis of
`@anvilkit/plugin-version-history` (see
`docs/archive/code-review/plugin-version-history-review-20260519104200.md` for
the originating findings).

**`@anvilkit/plugin-version-history`**

- **Storage** — `localStorageAdapter` and `inMemoryAdapter` now share a
  delta-chain store: every `KEYFRAME_INTERVAL`-th save is a full
  keyframe and the snapshots in between are stored as the `IRDiff` from
  the previous record (with the snapshot's own `assets`/`metadata`
  carried verbatim, since `diffIR` does not model those). `load` walks
  `base` pointers to the nearest keyframe and replays the diffs with
  `applyDiff`. A delta is only accepted when a real structural
  equality check on the reconstructed candidate matches the input, so
  reconstruction is byte-for-byte lossless. Snapshots written by older
  versions are raw `PageIR` JSON and are read transparently as
  keyframes — no migration required.
- **Eviction safety** — Deleting a snapshot that other deltas chain
  back to plans the keyframe-promotions in memory first, frees the
  target record's bytes, then writes the (strictly larger) full
  replacements. If a write fails (e.g. `STORAGE_QUOTA_EXCEEDED` mid-way
  through promotion), the original target is restored so the chain
  remains reconstructable.
- **`deepEqual` (`diff.ts`)** — Rewritten as order-insensitive key-set
  compare (O(n) instead of O(n log n) per node) with a `seen` pair-map
  cycle guard so untrusted cyclic prop values cannot infinite-loop.
  Semantics are unchanged; the `applyDiff` `before`-state checks and
  the 500-case `diffIR` round-trip property still hold.
- **Hash** — `hashPageIR` widened from a 32-bit FNV-1a fingerprint
  (~50% collision risk at ~65 k snapshots) to four independent 32-bit
  lanes (128-bit, collision risk negligible). The value remains an
  opaque string — width is not part of the contract, and old 8-char
  hashes from prior versions remain valid strings.
- **`assertPageIR` (`adapters/local-storage.ts`)** — Now an
  `asserts value is PageIR` predicate, removing the fragile
  `as unknown as PageIR` double-cast.
- **UI hardening** — Snapshot timestamps render through a new
  `useFormattedTimestamp` hook that returns the raw ISO during the
  first render (matching the server payload) and the localized value
  after mount; if `iso` changes the render path returns the new ISO
  immediately so no paint shows a stale localized timestamp.
  `SnapshotHistoryModal` migrated from the hand-rolled overlay to the
  shared `@anvilkit/ui` `Dialog`, picking up focus-trap, scroll-lock,
  `Escape`, and focus-restoration. `handleRestore` is now `try/finally`
  - mounted-ref guarded so the disabled button can never get stuck
    after a slow restore unmounts the modal.
- **Collab cache invalidation** — `VersionHistoryUI` now wires the
  optional `SnapshotAdapter.subscribe(onUpdate)` callback to clear its
  in-memory snapshot cache and re-list, so a remote-update from a
  collaborative adapter never renders a stale diff.
- **Opt-in type advertising** — `createVersionHistoryPlugin` now
  returns `StudioPluginContributing<VersionHistoryContribution>` via
  the new `defineStudioPlugin` helper, so consumers can recover the
  contributed adapter/snapshot types from a plugins array using
  `InferPluginContributions<typeof plugins>`.

**`@anvilkit/core`** (additive, type-only)

- New `StudioPluginContributing<Contributes>` sub-interface, branded
  with a module-private `unique symbol` so it lives in its own
  property namespace and leaves the base `StudioPlugin` shape (and
  variance) untouched.
- New `defineStudioPlugin<Contributes>(plugin)` helper that performs
  the (unavoidable) type-only cast in one place.
- New `InferPluginContributions<Plugins>` mapped-tuple helper that
  distributes over a plugins tuple, picks up the branded `Contributes`
  union from each `StudioPluginContributing` element, and collapses
  everything else (raw `StudioPlugin`, `PuckPlugin`, …) to `never`.
  The brand on the conditional is **required**, so an unbranded
  `StudioPlugin` cannot pollute the inferred union with `unknown`.
- New `StudioAnyPlugin<UserConfig>` alias.
- No runtime change, no `coreVersion` bump required — existing plugin
  shapes, `register` signatures, and the frozen 0.1.x contract are
  preserved.

No breaking changes. All adapter-contract, diff property (500 fuzz +
200 meta-only), legacy back-compat, delete-re-root, eviction, and
core type-inference tests pass.
