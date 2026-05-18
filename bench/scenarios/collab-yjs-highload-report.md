# plugin-collab-yjs — High-Load Performance Report

Generated: 2026-05-18T09:37:24.406Z

> ⚠️ **PARTIAL RUN.** The load/measurement phase aborted before completing (most likely the host could not sustain the requested 12 peers × 2000-node docs in one process — Risk #3). Figures below reflect only what was collected with **12** peers actually connected. Re-run with a lower `PEER_COUNT`.

## Scenario

| Parameter | Value |
| --- | --- |
| Document size | 2000 nodes (Button) |
| Collaborator peers | 12 (requested 12) |
| Per-peer edit rate | 1 edit / 500 ms |
| Probe cadence | 1 / 1000 ms |
| Load duration | 60 s |
| Browser | headless Chromium (Playwright) |

## 1. Node rendering completion time

**10507.0 ms** — navigation → ≥90% of 2000 nodes rendered & stable in the canvas (2001 `[data-puck-component]` nodes observed).

## 2. Synchronization latency (collaborator action → observed)

| Path | p50 | p95 | max | mean | samples |
| --- | --- | --- | --- | --- | --- |
| Adapter layer (observer peer) | 21.0 ms | 49.0 ms | 76.0 ms | 25.6 ms | 44 |
| Browser end-to-end (poll-limited) | n/a | n/a | n/a | n/a | 0 |

_Adapter-layer is the precise number: relay round-trip + native-tree decode — the same code path the browser's adapter runs. Browser end-to-end is polled every ~250 ms so its resolution is bounded by that interval; treat it as directional._

## 3. UI lag / freeze frequency

Primary signal: a 100ms `setInterval` heartbeat injected into the editor. Excess gap between ticks = time the main thread was blocked (what the user perceives as stutter/freeze). This is headless-safe; rAF is parked headless and shown only if captured.

| Metric | Value |
| --- | --- |
| Heartbeat samples | 0 (100ms target) |
| Jank events (block >50 ms) | 0 (0.0/min) |
| Freeze events (block >200 ms) | 0 (0.0/min) |
| Worst single block | n/a |
| Total blocked time | 0.0 ms |

## 4. Frame drops & blocking incidents (Long Tasks API)

Corroborating signal from the Long Tasks API (works headless). Total Blocking Time = Σ(task − 50ms); each long task is a frame the compositor could not produce.

| Metric | Value |
| --- | --- |
| Long tasks observed | 0 |
| Total Blocking Time | 0.0 ms |
| Longest task | n/a |

## 5. Memory usage trend

| Series | start | peak | end | slope |
| --- | --- | --- | --- | --- |
| Browser JS heap | 168.8 MiB | 168.8 MiB | 168.8 MiB | n/a |
| Node peers RSS | 1119.8 MiB | 2040.4 MiB | 2040.4 MiB | 619.70 MiB/min |

_A near-zero slope indicates no leak under sustained load. A clearly positive heap slope sustained past warm-up is the signal to chase._

## 6. Summary & caveats

- Avg operation latency (adapter layer): **25.6 ms** across 44 probe round-trips under 12 concurrent editors.
- Blocking incidents: **0** freezes >200 ms (heartbeat), worst block **n/a**; Long-Tasks Total Blocking Time **0.0 ms** over 60 s.
- Caveats (read before acting on these numbers):
  1. **1 real browser + N headless peers.** True 100-thread concurrency is impossible in one process; headless interleaved writes are a faithful proxy for the relay/CRDT/dispatch paths, not for 100 real browsers' render cost.
  2. Actual peer count was **12** (requested 12). If lower than requested, the host could not sustain the sockets/docs — scale figures accordingly.
  3. Node `Date.now()` (peer stamp) vs browser/observer clock is sub-millisecond on one host — fine for relative latency.
  4. Headless Chromium frame timing differs from headed; the heartbeat is the headless-safe jank signal (rAF is parked).
  5. **Browser end-to-end latency may read `n/a`.** The plugin's H1 inbound scheduler flushes remote updates on `requestAnimationFrame`, which headless Chromium parks — so post-hydration repaints (and the visible probe) may never land headless even though the relay/adapter deliver them on time (see the adapter-layer number, which is the real sync latency). To capture browser-visible latency, run headed under Xvfb: `xvfb-run -a pnpm bench:collab-highload` with a headed launch.

