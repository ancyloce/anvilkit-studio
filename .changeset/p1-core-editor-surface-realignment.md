---
"@anvilkit/core": minor
---

Editor surface realigned onto the canonical contracts (PLAN-0026 §3.1, §3.3;
PLAN-0028 P1).

**Breaking — removed from `@anvilkit/core/react/editor`.** The authoring
decoration layer that existed to serve the sidecar is gone:

- `AuthoringBoundary` and `AuthoringBoundaryProps`
- `decoratePuckConfig` and `DecoratePuckConfigOptions`
- `AuthoringStyleContext` and `AuthoringStyleLookup`

**Breaking — removed from `@anvilkit/core/editor`.** `readEditorMetadata`
(the **v1** capability reader, formerly `editor/capability-metadata.ts`) is
deleted along with the v1 `EditorCapabilityMetadata` contract. The canonical
reader of the same name now lives in `puck/component-metadata.ts`; it is
re-exported from the editor barrel in a following release, together with the
retirement of the v1 capability registry. Until then, use
`readEditorMetadataFor(config, type)`.

**Re-exported under canonical names.** The renamed appearance, interaction
and binding contracts (`AnvilAppearance`, `TargetAppearance`, `Interaction`,
`Binding`) surface through `@anvilkit/core/editor`.

**Note on the snapshot diff.** This release also regenerates api-snapshots
that had drifted since 2026-08-03. Core's `check:all` runs
`check:no-headless-import` before `check:api-snapshot-all`, and that earlier
gate has been failing, so the snapshot gate had not run for weeks. Much of
the apparent surface growth in `api-snapshot.editor.json` and
`api-snapshot.react-editor.json` is pre-existing composition and
appearance-commit work being recorded for the first time, not new API added
in this release.
