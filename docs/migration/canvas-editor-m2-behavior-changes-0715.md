# Canvas Editor M2 (PRD 0012 Phase 1b) — Host-Facing Behavior Changes

Date: 2026-07-15 · Scope: `@anvilkit/canvas-editor` (uncommitted M0–M2 work) · Audience: hosts mounting `<CanvasWorkspace>` or headless `<CanvasStudio>`

Headless `<CanvasStudio>` embeds are unaffected by every shell change below (no keymap, no chrome, no-op toast/dialog seams) unless a row says otherwise.

## Behavior changes (new defaults, each with an opt-out)

| Change | Default | Opt-out / override |
| --- | --- | --- |
| **Workspace shortcuts** (A-04, FR-040): full core keymap (V/H/R/O/L/P/T/I tools, ⌘Z/⇧⌘Z, ⌘C/X/V/D, ⌘G/⇧⌘G, arrows, Escape stack, zoom keys) installs on the workspace root. | On | `<CanvasWorkspace shortcuts={false}>` or an options object to extend/override bindings |
| **Return-to-Select after create** (A-10, FR-012): creation tools commit one element, then the editor returns to Select. | On | `continuousCreation` prop (also surfaces a footer indicator) |
| **Floating tool strip** (B-06, FR-010): vertical tool pill floats over the canvas with registry-derived shortcut tooltips. | On | `<CanvasWorkspace toolStrip={false}>` |
| **Export dialog** (B-09, FR-154): `createCanvasExportPlugin` now opens the full export DIALOG (format, page scope, scale, per-page progress, PDF fidelity note). | Dialog | The old `ExportMenu` popover stays exported for compat (§15.9); mount it via a custom header plugin if needed |
| **Toast + dialog hosts** (B-05, FR-170/171): destructive actions confirm through `CanvasDialogs`; feedback lands as toasts. | On in the shell | Headless embeds keep auto-confirm/no-op seams; hosts can present their own via context |
| **Uploads panel + canvas drop zone** (B-10, FR-091/092): file drags onto the canvas upload via `assetUploader` when configured. | Panel always visible; upload requires adapter | No adapter → info toast, no mutation |
| **Page navigator** (B-11): double-click rename, drag-and-drop page reorder, page context menu gains Rename + Page settings (size/orientation/background/resize-mode dialog). | On | No opt-out (additive UI) |
| **Inspector** (B-12, FR-070/073): page properties when nothing is selected (replaces the empty hint), multi-selection editing with Mixed values, appearance (blend/visible/lock/z-order), stroke style, per-corner radii, image fit modes, §10 field contract (live preview, coalesced undo, Escape revert). | On | No opt-out (inspector semantics) |
| **Workspace layout** (B-14, FR-130/132): resizable Tab Panel (persisted, v2 store migration is automatic), restore-default-layout in the header menu, ≤768 px overlay panels, ≤1024 px inspector auto-collapse. | On | Layout is user-controlled; persisted per `storeId` |
| **Save status + auto-save** (B-08, FR-160..163): with `persistenceAdapter` set, dirty tracking, debounced auto-save, retry, beforeunload guard, header save pill. | Only with adapter | Omit `persistenceAdapter` → no change |

## Public API additions (all additive)

- `CanvasStudioProps`: `persistenceAdapter`, `autoSave`, `onSaveStateChange`, `assetPicker`, `assetUploader`, `onError` (FR-172 host error callback).
- `CanvasWorkspaceProps`: `shortcuts`, `toolStrip`.
- Context: `commitCoalesced`, `fieldPreviewStore`, `saveStatusStore`/`save`/`canLeave`, `uploadStore`, `assetPicker`/`assetUploader`.
- Fields: `FieldContractTarget`, `contract`/`mixed` props on `NumberField`/`TextField`/`ColorField` (legacy `onCommit` unchanged).
- Error boundary: `onReloadDocument`, `onExportRecovery`, `labels`, copyable error id.

## E2E-visible changes to watch in host suites

- Export flow testids moved from the `canvas-export-*` popover to the export dialog (`workspace-export` opens `export-dialog`; formats are `export-format-*`; run is `export-run`).
- The inspector no longer renders `property-inspector-empty` when a page exists — it renders `page-properties`.
- New chrome testids: `tool-strip`, `workspace-save-status`, `workspace-selection-summary`, `panel-resize-handle`, `panel-overlay`.

## Migration decision for the two production mounts

- `apps/studio` canvas route (`CanvasEditorSurface`) and the docs playground (`plugin-canvas-studio` overlay) both adopt ALL new defaults — no opt-outs. Rationale: both are reference surfaces; the PRD Phase 1b outcome is the default experience.

## B-17 E2E verification status (2026-07-15, WSL2 dev box)

Spec migrations applied to `apps/studio/e2e/canvas/pages-export.spec.ts`:
page deletion now accepts the B-05 confirm dialog (`canvas-confirm-accept`),
and the export flow drives the B-09 dialog (`workspace-export` →
`export-format-*` → `export-run`, Escape between runs).

| Suite | Result |
| --- | --- |
| `e2e/canvas/editor-core.spec.ts` | 3/3 pass against the new defaults |
| `e2e/canvas/ai-perf.spec.ts` | pass |
| `e2e/canvas/pages-export.spec.ts` | 2/2 pass (both migrated flows) |
| `e2e/canvas/templates-panel.spec.ts`, `puck-bridge.spec.ts`, `preview-object-url.verify.spec.ts` | UNVERIFIED on this box — failures are `page.goto net::ERR_ABORTED` after the dev server degrades (the known env-level Next 16 dev `uncaughtException: … reading 'length'` crash; see memory `next16_dev_uncaught_length_env_crash`), plus parallel-worker compile starvation. Serialized (`--workers=1`) fresh-boot runs are required; re-run in CI where clean boots are enforced. |

Environmental notes for whoever re-runs: serialized workers only; a killed
playwright run orphans its `next dev` webServer, which then squats the port as
a half-dead zombie — boot on a fresh port (`PORT` env) instead of fighting it.
