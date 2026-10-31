# Agent API stream fixtures (plan 0005 Phase 3)

Recorded `operation.changed` frames of the AnvilKit Agent API, one JSON object per line, with the operation id replaced by `OP` and the brief id by `BRIEF`. `e2e/fixtures/agent-api-double.mjs` replays them as the SSE stream of an operation it creates.

| File | Origin | Content |
|---|---|---|
| `preparation.jsonl` | `anvilkit-services/outputs/smoke-api-generation/20261023T195131Z` (preparation, PASS) | 8 frames: intake to `brief_frozen`, no clarification round |
| `generation-success.jsonl` | same run (generation, PASS) | 31 frames: every progress node, both stage verdicts `certified`, `candidate_ready` |
| `generation-failed.jsonl` | `20261023T194140Z` (generation, FAIL) | 20 frames: review started, stage `infrastructure_failed`/`OBSERVER_FAILED`, lifecycle `failed` |
| `generation-model-error.jsonl` | SYNTHETIC: `generation-failed.jsonl` with one inserted frame | the `review failed UPSTREAM_TOOL_ARGUMENTS_INVALID` progress event the team reports since the classification fix of 2026-10-23 (the recorded run predates it); later sequences shifted by one |

These are facts of development runs (DEVELOPMENT_ONLY); they contain no prompts, source or model text.
