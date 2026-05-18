# plugin-collab-yjs — High-Load Performance Report

Generated: 2026-05-17T22:55:50.908Z

## Scenario

| Parameter | Value |
| --- | --- |
| Document size | 2000 nodes (Button) |
| Collaborator peers | 0 (requested 0) |
| Per-peer edit rate | 1 edit / 500 ms |
| Probe cadence | 1 / 1000 ms |
| Load duration | 20 s |
| Browser | headless Chromium (Playwright) |

## 1. Node rendering completion time

**29540.0 ms** — navigation → ≥90% of 2000 nodes rendered & stable in the canvas (2001 `[data-puck-component]` nodes observed).

## 2. Synchronization latency (collaborator action → observed)

| Path | p50 | p95 | max | mean | samples |
| --- | --- | --- | --- | --- | --- |
| Adapter layer (observer peer) | 35.0 ms | 200.0 ms | 24708.0 ms | 1116.7 ms | 23 |
| Browser end-to-end (poll-limited) | 512.0 ms | 2957.0 ms | 2957.0 ms | 633.1 ms | 20 |

_Adapter-layer is the precise number: relay round-trip + native-tree decode — the same code path the browser's adapter runs. Browser end-to-end is polled every ~250 ms so its resolution is bounded by that interval; treat it as directional._

## 3. UI lag / freeze frequency

Primary signal: a 100ms `setInterval` heartbeat injected into the editor. Excess gap between ticks = time the main thread was blocked (what the user perceives as stutter/freeze). This is headless-safe; rAF is parked headless and shown only if captured.

| Metric | Value |
| --- | --- |
| Heartbeat samples | 195 (100ms target) |
| Jank events (block >50 ms) | 29 (87.0/min) |
| Freeze events (block >200 ms) | 11 (33.0/min) |
| Worst single block | 22901.3 ms |
| Total blocked time | 31409.4 ms |

## 4. Frame drops & blocking incidents (Long Tasks API)

Corroborating signal from the Long Tasks API (works headless). Total Blocking Time = Σ(task − 50ms); each long task is a frame the compositor could not produce.

| Metric | Value |
| --- | --- |
| Long tasks observed | 35 |
| Total Blocking Time | 29698.0 ms |
| Longest task | 22286.0 ms |

## 5. Memory usage trend

| Series | start | peak | end | slope |
| --- | --- | --- | --- | --- |
| Browser JS heap | 270.3 MiB | 320.8 MiB | 239.3 MiB | 114.28 MiB/min |
| Node peers RSS | 511.6 MiB | 530.9 MiB | 530.9 MiB | 100.46 MiB/min |

_A near-zero slope indicates no leak under sustained load. A clearly positive heap slope sustained past warm-up is the signal to chase._

## 6. Summary & caveats

- Avg operation latency (adapter layer): **1116.7 ms** across 23 probe round-trips under 0 concurrent editors.
- Blocking incidents: **11** freezes >200 ms (heartbeat), worst block **22901.3 ms**; Long-Tasks Total Blocking Time **29698.0 ms** over 20 s.
- Caveats (read before acting on these numbers):
  1. **1 real browser + N headless peers.** True 100-thread concurrency is impossible in one process; headless interleaved writes are a faithful proxy for the relay/CRDT/dispatch paths, not for 100 real browsers' render cost.
  2. Actual peer count was **0** (requested 0). If lower than requested, the host could not sustain the sockets/docs — scale figures accordingly.
  3. Node `Date.now()` (peer stamp) vs browser/observer clock is sub-millisecond on one host — fine for relative latency.
  4. Headless Chromium frame timing differs from headed; the heartbeat is the headless-safe jank signal (rAF is parked).
  5. **Browser end-to-end latency may read `n/a`.** The plugin's H1 inbound scheduler flushes remote updates on `requestAnimationFrame`, which headless Chromium parks — so post-hydration repaints (and the visible probe) may never land headless even though the relay/adapter deliver them on time (see the adapter-layer number, which is the real sync latency). To capture browser-visible latency, run headed under Xvfb: `xvfb-run -a pnpm bench:collab-highload` with a headed launch.

