# @anvilkit/ir

## 0.1.0-alpha.0 — 2026-04-11

Initial scaffold for Phase 3 IR layer. Ships the public barrel
(`puckDataToIR`, `irToPuckData`, `collectAssets`, `identifySlots`)
as throwing stubs so downstream packages (`@anvilkit/plugin-export-html`,
`@anvilkit/plugin-ai-copilot`) can pin against the final public shape
while real implementations land in `phase3-003` (core transforms +
round-trip) and `phase3-004` (asset + slot helpers + snapshot
fixtures).

See [`phase3-002`](../../docs/tasks/phase3-002-ir-scaffold.md) for
scope and [`phase-3-export-ai-pipeline-plan.md`](../../docs/plans/phase-3-export-ai-pipeline-plan.md)
§4.2 and §5 M1 for how this package fits into the export pipeline.
