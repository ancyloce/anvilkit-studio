# Realtime collaboration — conflict resolution and trust model

**Status:** alpha (`@anvilkit/plugin-collab-yjs@0.1.0-alpha.0`,
M12 / `phase6-018`)
**Owner:** plugins workgroup
**Last updated:** 2026-04-28

This document is the authoritative reference for the conflict
resolution semantics, ordering guarantees, and trust boundaries of
`@anvilkit/plugin-collab-yjs` — the first-party realtime
collaboration plugin shipped on the alpha channel during M12 of the
Phase 6 roadmap.

It is linked from
[`docs/security/plugin-trust-model.md`](../security/plugin-trust-model.md)
§ "Realtime `subscribe()` trust boundary" and from
[`docs/policies/lts.md`](../policies/lts.md) § "Alpha-channel
packages."

---

## 1. CRDT semantics

The plugin is built on [Yjs](https://github.com/yjs/yjs), a CRDT
library that provides **eventually consistent, deterministic merge**
across an arbitrary number of replicas.

### 1.1 Encoding (alpha)

The alpha encoding stores the latest live `PageIR` as a single JSON
string under one Y.Map key (`pageIR`). Each saved snapshot is stored
under stable per-id metadata and payload keys so the adapter can still
honor the base `SnapshotAdapter` history contract. See
[`packages/plugins/plugin-collab-yjs/src/encode.ts`](../../packages/plugins/plugin-collab-yjs/src/encode.ts)
and
[`packages/plugins/plugin-collab-yjs/src/yjs-adapter.ts`](../../packages/plugins/plugin-collab-yjs/src/yjs-adapter.ts).

This is the simplest encoding that satisfies the M12 exit criteria —
it gives **convergence** for free on the live document (Yjs guarantees
deterministic last-writer-wins on Y.Map keys), and the IR tree itself
remains the single source of truth. Snapshot records use unique keys,
so non-conflicting snapshot saves can coexist even while the live
`pageIR` key resolves by LWW. The trade-off is that concurrent live
writes are LWW on the WHOLE PageIR, not per-prop; see § 2 for what
that means in practice.

The GA target (post-1.1) is to mirror the IR tree natively in Yjs —
each `PageIRNode` becomes a Y.Map, props become Y.Map entries,
`children` becomes a Y.Array. That gives per-prop merge for
non-conflicting concurrent edits and is the standard Yjs pattern for
structured documents. The blob encoding is fast to ship and easy to
reason about; the native-tree encoding is the right long-term shape
but represents a larger surface to validate against `@anvilkit/ir`'s
`puckDataToIR` / `irToPuckData` round-trip invariants.

### 1.2 Object key sorting

`encodeIR()` sorts non-array object keys before serialising. Without
this, two replicas observing the same logical IR could produce
byte-different JSON strings (because object iteration order is
implementation-defined for non-integer keys), and Y.Map LWW would
flap on key-order alone. Sorting at the encoding boundary gives
byte-equality for byte-equal logical IRs; see the
`encode is order-independent` test in
`src/__tests__/round-trip.test.ts`.

---

## 2. Ordering and convergence guarantees

The contract is **convergence**, not preservation of every concurrent
write:

1. **Eventually consistent.** After every replica has received every
   update, all replicas observe the same `PageIR`.
2. **Deterministic LWW.** When two replicas issue concurrent writes
   to the same Y.Map key (i.e. the whole PageIR under the alpha
   blob encoding), Yjs's LWW algorithm picks ONE of the two values
   based on a deterministic clock. Both replicas agree on the
   winner; neither side wins systematically across runs.
3. **Local writes never echo.** A replica never observes its own
   write through its own `subscribe()` callback. The plugin filters
   on `transaction.origin === localPeer.id`. See
   `yjs-adapter.ts:105-121`.
4. **Update ordering is preserved per origin.** `subscribe()`
   delivers updates from a remote origin in the same order Yjs
   committed them locally. The
   `subscribe delivery is ordered consistently with the local transaction log`
   test in `src/__tests__/concurrent-edit.test.ts` pins this.

### 2.1 What's lost under alpha LWW

- **Per-prop merge of disjoint concurrent edits.** If replica A
  changes `headline` and replica B changes `subtitle` on the same
  node concurrently, only ONE side's edits survive. Both replicas
  agree on which.
- **Move + insert interleavings.** A move on replica A and an insert
  on replica B in the same subtree resolve under whole-blob LWW;
  one of the two operations is silently overwritten.

The
`disjoint prop keys on the same node — LWW collapses to one writer (alpha)`
test in `src/__tests__/concurrent-edit.test.ts` pins this exact
limitation. The post-1.1 native-tree encoding will tighten this to
per-prop merge; that test will need to be flipped at the same time.

---

## 3. Partition behaviour

### 3.1 Offline edits

When the transport drops, each replica continues mutating its local
Y.Doc. Updates queue at the transport layer (e.g. y-websocket buffers
its outbound queue; the tests in `src/__tests__/partition.test.ts`
model the queue explicitly via an in-process partitionable link).

On reconnect, the queued updates are applied in both directions.
Yjs's CRDT properties guarantee that after every queued update is
exchanged, both replicas converge to the same state — regardless of
how many edits each side made offline.

### 3.2 Subscribe delivery on reconnect

`subscribe()` fires for at least one remote update on reconnect, even
if the queued updates are merged into a single Yjs update before
delivery. Hosts MUST NOT assume "one subscribe call per upstream
edit" — Yjs is allowed to coalesce. The
`subscribe fires for queued remote edits the moment the link is restored`
test pins this.

### 3.3 Concurrent local edit during partition

If replica B writes locally during a partition AND replica A's
queued writes target the same Y.Map key, the LWW resolution at
reconnect time may keep B's write and discard A's. The plugin's
`subscribe()` will not fire on B for the discarded A writes (the
Y.Map observer only fires when the local view of the key changes).

This is correct CRDT behaviour. Hosts that need a "do not lose any
edit" guarantee under partition must layer an application-level
versioning scheme on top — the plugin does not provide one in alpha.

---

## 4. Behaviour for `meta.locked` nodes during concurrent edits

`PageIRNode.meta.locked` is an **authoring-time signal**, not a CRDT
constraint. The CRDT layer is content-blind: it merges every update,
regardless of whether the target node is locked.

Enforcing the lock is the **host's** responsibility. The pattern the
demo uses (and the integration tests pin) is:

1. The plugin's `subscribe()` callback delivers the new `PageIR`.
2. A host-side guard sits between the subscribe callback and the
   downstream sink (`puckApi.dispatch({ type: "setData" })`).
3. The guard compares the previous IR to the next IR. If a node is
   locked in BOTH the previous and the next IR AND its props
   changed, the guard surfaces a `LOCKED_NODE` diagnostic and
   drops the dispatch.
4. The CRDT state still merges — the dropped dispatch only affects
   the local Puck canvas, not the shared Y.Doc.

This is the contract pinned by `src/__tests__/lock-contention.test.ts`:

| Scenario                                          | CRDT merges? | Guard accepts? |
| ------------------------------------------------- | ------------ | -------------- |
| Initial node creation with `locked: true`         | ✓            | ✓              |
| Edit prop while `before.locked && after.locked`   | ✓            | ✗ (LOCKED_NODE) |
| Unlock + edit prop in one write                   | ✓            | ✓              |
| Edit prop after unlock                            | ✓            | ✓              |

### 4.1 Why merge through the lock?

Two reasons:

1. **CRDTs cannot enforce content predicates.** Yjs has no concept
   of "this key is read-only." The only way to gate a write is to
   reject it before sending, which moves the gate to the sender.
   In a multi-replica system, the sender can't know whether the
   node was unlocked between when it composed the write and when
   the receiver evaluates it. Eventually-consistent locks are a
   research problem, not an alpha-channel problem.
2. **The state of record is the IR**, and the IR's lock metadata
   round-trips through every layer (Puck data ↔ IR ↔ CRDT). If a
   replica unlocks a node, all other replicas eventually observe
   the unlock and stop dropping subsequent edits.

Hosts that need stricter lock semantics (e.g. "no edit reaches the
shared Y.Doc unless the local lock check passes") should layer an
application-level RBAC check at the EDITOR side, before
`adapter.save()` is called. The plugin's `onDataChange` hook is the
right seam for that.

---

## 5. Recovery from desync

If two replicas somehow diverge (e.g. one runs a different plugin
version that encodes the IR differently), the recovery path is:

1. Pick a "source of truth" replica.
2. Have the SoT replica `adapter.save(adapter.load(latestId), { label: "resync" })`
   — this re-encodes the current IR through the alpha JSON blob and
   writes it as a fresh transaction.
3. Other replicas observe the resync update via `subscribe()` and
   call `dispatch({ type: "setData", data: irToPuckData(ir) })` to
   replace their local Puck state.
4. If a replica's Y.Doc is corrupted, the host MUST destroy the
   YDoc and rebuild it from the SoT replica's state vector (Yjs's
   `Y.encodeStateAsUpdate(soT)` + `Y.applyUpdate(fresh, vector)`).

The plugin does not auto-detect desync. Detection lives at the host:
typical signals are a `pageIRHash` mismatch on `subscribe()` or an
explicit user-driven "force resync" button.

---

## 6. Known alpha-only edge cases

The following are documented limitations of the alpha encoding and
are tracked for the post-1.1 native-tree migration:

- **Per-prop merge is not available.** Concurrent edits to disjoint
  prop keys on the same node lose one side's write under whole-blob
  LWW. (See § 2.1.)
- **Subscribe coalescing.** Yjs is allowed to coalesce multiple
  upstream updates into one `subscribe()` callback. Hosts that need
  per-edit telemetry must drive that off the editor's
  `onDataChange` hook, not the adapter's `subscribe`.
- **No conflict diagnostics from the CRDT layer.** When a write is
  overwritten under LWW, neither replica is informed that an
  overwrite happened. Surfacing "your edit was overridden" UI
  requires a host-side comparison of `pageIRHash` before vs after.
- **Locks are advisory.** See § 4. The CRDT layer always merges.
- **Awareness state is ephemeral.** Presence (cursor, selection)
  is broadcast over y-protocols Awareness, which does NOT persist
  across reconnects. A replica that joins after a partition sees
  only the awareness states of replicas currently connected — not
  a history of who-was-here-when.
- **No backpressure.** A high-throughput producer (e.g. a user
  dragging a slider that fires 60 edits per second) can saturate
  the transport. y-websocket has no built-in backpressure; hosts
  that need rate limiting must wrap the adapter's `save` and debounce.

These are referenced in
`docs/announcements/2027-12-v1-1-ga.md`
under the "Alpha caveats" section.

---

## 7. Trust boundary — `subscribe()` is privileged input

The plugin's `subscribe()` callback delivers a `PageIR` produced
remotely. From the host's perspective, this is **untrusted input**:

- The `PageIR` may have been authored by another peer running a
  malicious build of the plugin, or with a corrupted Y.Doc.
- The `PageIR` shape is validated only at the encoding boundary
  (`decodeIR()` checks `version === "1"`); no schema-level
  validation is performed before dispatch.

Hosts MUST treat the IR delivered by `subscribe()` the same way
they treat IR delivered by `validateAiOutput()`: route it through
`@anvilkit/validator` if the threat model includes hostile peers,
escape every prop string at render time (the HTML/React exporters
already do this), and never `eval` or `new Function` from props.

The full plugin trust model is in
[`docs/security/plugin-trust-model.md`](../security/plugin-trust-model.md).
This document covers the realtime-specific subset.

---

## 7a. Integration recipe — consolidated factory

Since v0.10 the collab system ships behind **one factory** for host
apps:

```ts
import { createCollabPlugin } from "@anvilkit/collab-ui";
```

This factory composes `@anvilkit/plugin-collab-yjs`'s adapter +
`createCollabDataPlugin` lifecycle hooks with `@anvilkit/collab-ui`'s
React provider, presence overlay, conflict toaster, and collaborator
slot into a single `StudioPlugin`. Hosts pass one plugin to `<Studio
plugins={[…]}>` and get the full data + UI bundle.

**Before — wrapper pattern (still supported; documented as the
"power-user" path):**

```tsx
<CollabUIProvider adapter={collabBundle.adapter} self={demoIdentity}>
  <CollabIdentitySync onDisplayNameChange={setDemoIdentityName} />
  <Studio
    plugins={[collabBundle.plugin, ...otherPlugins]}
    collaboratorsSlot={<PeerAvatarStack />}
  />
  <CollabPresenceLayer />
  <ConflictNoticeCenter />
</CollabUIProvider>
```

**After — consolidated factory (the default integration):**

```tsx
<Studio
  plugins={[
    createCollabPlugin({
      doc,
      awareness,
      self: demoIdentity,
      onIdentityChange: (n) => setDemoIdentityName(n.displayName),
      puckConfig,
    }),
    ...otherPlugins,
  ]}
/>
```

The factory contributes via four extension points on
`StudioPluginRegistration` (added in `core-014`):

| Field        | Provided by `createCollabPlugin()`                                  |
| ------------ | ------------------------------------------------------------------- |
| `hooks`      | Forwarded from `createCollabDataPlugin` — onInit / onDataChange / onDestroy. |
| `providers`  | One: `<CollabUIProvider>` wrapped with an `IdentitySync` bridge.   |
| `overlays`   | Two: `<PresenceLayer>` @ `canvas` and `<ConflictNoticeCenter>` @ `notifications`. |
| `slots`      | One: `<PeerAvatarStack>` claims the `collaborators` slot.          |

Host apps that need a custom collaborator widget pass `collaboratorsSlot`
on `<Studio>` — that prop wins over the plugin's slot contribution
("host has the final word" rule).

**Power-user path** stays unchanged: import `createYjsAdapter` and
`createCollabDataPlugin` directly from `@anvilkit/plugin-collab-yjs`
for headless contexts (Node sync workers, server-side IR processors,
alternative UIs).

**Naming:** the data-only factory in `@anvilkit/plugin-collab-yjs` was
renamed `createCollabPlugin` → `createCollabDataPlugin` in the same
release to disambiguate from the new consolidated factory. The legacy
name remains exported as a deprecated alias for one minor with a
one-shot `console.warn` on first call.

### Boundary update (architecture §plugin contract)

`StudioPluginRegistration` is no longer React-free at the *type*
level: `providers` / `overlays` / `slots` carry `ComponentType` values.
The runtime layer (`@anvilkit/core/runtime/compile-plugins`) continues
to treat these as opaque — it never instantiates them. The React
boundary is `<Studio>` (`packages/core/src/react/components/Studio.tsx`),
which composes providers, dispatches overlays by placement, and
forwards slot components into `<ChromePropsProvider>`.

---

## 8. References

- `@anvilkit/plugin-collab-yjs` —
  `packages/plugins/plugin-collab-yjs/src/yjs-adapter.ts` (adapter),
  `src/plugin.ts` (Studio plugin), `src/encode.ts` (IR encoding).
- Integration tests — `src/__tests__/partition.test.ts`,
  `src/__tests__/concurrent-edit.test.ts`,
  `src/__tests__/lock-contention.test.ts`.
- `@anvilkit/plugin-version-history` — defines the SnapshotAdapter
  v2 contract that the Yjs adapter implements
  (`packages/plugins/plugin-version-history/src/types.ts`).
- `@anvilkit/core/types` — `PageIR`, `PageIRNode`, `PageIRNodeMeta`.
- Yjs docs — [https://docs.yjs.dev/](https://docs.yjs.dev/) for
  general CRDT semantics; the alpha plugin pins to `yjs@^13.6.27`.
- y-protocols Awareness —
  [https://github.com/yjs/y-protocols](https://github.com/yjs/y-protocols).
- Reference transport — `examples/y-websocket-server.mjs` under
  the plugin package.
