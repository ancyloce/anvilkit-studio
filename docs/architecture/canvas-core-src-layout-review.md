# @anvilkit/canvas-core — src/ Layout Architecture Review

- **Date:** 2026-07-09
- **Scope:** physical directory structure of `packages/canvas/core/src` only. No architectural redesign, no public API changes.
> **Superseded for current rank assignments (2026-07-27, OQ-2 / PLAN 0022 T-M1-07).**
> The live rank table the `check:layering` gate enforces now lives *inside* the
> package, at `packages/capabilities/canvas/core/docs/architecture/src-layer-map.md`,
> so that gate, code, and record ship together in the submodule. §4 below is
> retained as the original review and has since drifted — it predates
> `limits.ts`, `hash.ts`, `uri.ts`, `text-contracts.ts`, `clipboard/`,
> `comment-contracts.ts`, `components/`, `component-ops/`, `layout/`,
> `policy-contracts.ts`, `component-libraries/`, and `brand-governance/`
> (last reconciled 2026-07-30, PLAN 0021 M0 / T-003). Read this document for the
> rationale, migration history, and rejected options; read the in-package map for
> what the gate actually checks.

- **Status:** EXECUTED 2026-07-09 — all four phases landed (ir/ + geometry/ domains, five domain barrels + 8-line root, `scripts/check-layering.mjs` wired into `check:all`, tests co-located per domain). All gates green at every step; 329/329 tests held throughout; zero public API change (api snapshot byte-identical after Phase 3). Originally verified against the real madge graph on a gate-green tree (one known pre-existing lint error in `commands.test.ts:1111`, now at `src/commands/__tests__/`).

---

## 0. Analysis basis (measured, not assumed)

22 modules, 5,346 source lines; 22 test files plus `__snapshots__/` in a flat `src/__tests__/`.

Full madge adjacency (arrows = "imports"):

```
types.ts                 -> (nothing)                                  239 ln
clock.ts                 -> (nothing)                                   17 ln
ir-walkers.ts            -> types                                      140 ln
ir-validators.ts         -> types, extensions/migration-registry  [!]  315 ln
ir-builders.ts           -> types, clock, ir-validators                313 ln
ir-mutations.ts          -> types, clock, ir-walkers                   580 ln
geometry.ts              -> types (type-only)                          214 ln
viewport.ts              -> geometry                                    46 ln
hit-test.ts              -> geometry, types                            154 ln
snap.ts                  -> (nothing; deliberately self-contained)     241 ln
ai-contracts.ts          -> types (type-only)                           85 ln
commands/types.ts        -> types                                      181 ln
commands/change-events.ts-> commands/types                             106 ln
commands/runtime.ts      -> clock, commands/types, geometry,
                            ir-mutations, ir-walkers, types            832 ln
commands/transaction.ts  -> change-events, runtime, commands/types,
                            types                                       49 ln
extensions/migration-registry.ts -> (nothing)                           86 ln
extensions/node-kind-registry.ts -> types (+ zod type)                 115 ln
extensions/command-registry.ts   -> commands/types, types               41 ln
extensions/canvas-runtime.ts     -> commands/*, extensions/*,
                                    ir-validators, types               248 ln
serialize/svg.ts         -> extensions/node-kind-registry (TYPE-ONLY),
                            geometry, ir-validators, ir-walkers, types 995 ln
serialize/pdf.ts         -> serialize/svg, ir-validators, types        327 ln
index.ts                 -> everything (public barrel)                  22 ln
```

External surface facts:

- **No deep imports exist anywhere in the workspace** (`rg 'canvas-core/src|canvas-core/dist/'` over apps + packages: zero hits). Every consumer — canvas-editor, plugin-canvas-studio, canvas-templates — imports the package root.
- `package.json` `exports` exposes only `"."` → `dist/index.{js,cjs}`. rslib builds **bundleless** (dist mirrors src 1:1), so internal moves change dist paths, but those paths are not part of the public contract.
- Path pins that must move with files: `vitest.config.ts` coverage excludes (`src/types.ts`, `src/ai-contracts.ts`, `src/commands/types.ts`, `src/index.ts`); the api snapshot records per-file source URLs (moves cause benign, regenerable drift).
- `check:circular` (madge) already gates cycles; nothing gates dependency *direction*.

---

## 1. Architecture evaluation

### Strengths

1. **The graph is already acyclic and almost perfectly layered.** ir → geometry → commands → extensions → serialize holds for 21 of 22 edges. This is a layout refresh, not a rescue.
2. **Three domains already have proper directories** (`commands/`, `extensions/`, `serialize/`) with high internal cohesion and clean, narrow entry files.
3. **Framework-free discipline is real and enforced** (`check-react-free`, `check-peer-deps` gates). No React/Konva concepts leak into the engine; Konva compatibility is documented as a *behavioral* contract (matrix order) rather than an import.
4. **Type-only boundaries are used deliberately**: `export type *` for `ai-contracts` and `types`; `serialize/svg` consumes the extension hook contract as `import type`.
5. **Zero deep-import debt.** The single public barrel means the physical layout can be reorganized with no consumer-visible change at all.

### Weaknesses

1. **The IR domain — the largest subsystem (5 files, 1,587 lines) — is flat, encoded as an `ir-` filename prefix.** The package's foundational domain is the only major one *without* a directory, an artifact of implementation history (these files came first; later subsystems got directories).
2. **One layering leak:** `ir-validators.ts → extensions/migration-registry.ts`. The IR wire-format's versioning mechanism (registry + `CANVAS_IR_MIGRATIONS`) physically lives in the *extensions* domain while being a hard dependency of IR parsing. Not a cycle (the registry is a leaf), but the dependency arrow points from a low layer into a high layer's directory.
3. **The spatial subsystem is four unrelated-looking root files** (`geometry.ts`, `viewport.ts`, `hit-test.ts`, `snap.ts`, 655 lines) that are in fact one cohesive domain — snapping/hit-testing/viewport all sit on the affine core. This domain will accrete (guides, constraint solving, bounds caching).
4. **`src/types.ts` is misnamed by position.** At root it reads as "package-wide types"; it is specifically the IR document model. Everything importing `./types.js` obscures the fact that the real base layer is *the IR*.
5. **Flat `src/__tests__/` (22 files)** loses domain ownership and will be unnavigable at a hundred files.
6. **Root barrel enumerates 20 files** — every new module edits the same few lines, a standing merge-conflict magnet across the parallel M1 tasks.

### Naming inconsistencies (observed, mostly tolerable)

- `CanvasPoint`/`CanvasRect` are declared in `commands/types.ts` — spatial primitives homed in the command layer. `snap.ts` separately declares its own `SnapRect` (documented as deliberate, lifted-from-editor compatibility). Three point/rect-ish shapes across three layers. Structural typing makes this harmless today; flagged as an *optional* future re-home (declare in geometry, re-export from `commands/types` to keep the API stable). Not part of this proposal — it edges into architecture, not layout.
- Two "runtime" files (`commands/runtime.ts` = command appliers, `extensions/canvas-runtime.ts` = resolved runtime object). Different qualified names; acceptable.

### Scalability / dependency risks

- Flat root + prefix conventions grow linearly and collapse at ~30 files.
- `migration-registry` housed in `extensions/` invites future extension-flavored code into the IR parse path; re-homing it makes the boundary self-evident.
- No direction gate: nothing today stops `ir/` from importing `commands/` — only review culture. Cheap to close (see §4).

---

## 2. Proposed directory tree

```
src/
├── index.ts                  # public barrel: CANVAS_CORE_VERSION + one line per domain
├── clock.ts                  # cross-cutting deterministic-time seam (nowIso/resolveNow)
├── ai-contracts.ts           # type-only AI protocol contracts (single-file domain, stays)
├── ir/                       # THE document model: types, schemas, versioning, tree ops
│   ├── index.ts              # domain entry (export type * for types.ts, export * for rest)
│   ├── types.ts              # <- src/types.ts
│   ├── validators.ts         # <- src/ir-validators.ts
│   ├── migrations.ts         # <- src/extensions/migration-registry.ts
│   ├── builders.ts           # <- src/ir-builders.ts
│   ├── walkers.ts            # <- src/ir-walkers.ts
│   └── mutations.ts          # <- src/ir-mutations.ts
├── geometry/                 # spatial math: affine core, viewport, hit-testing, snapping
│   ├── index.ts
│   ├── affine.ts             # <- src/geometry.ts
│   ├── viewport.ts           # <- src/viewport.ts
│   ├── hit-test.ts           # <- src/hit-test.ts
│   └── snap.ts               # <- src/snap.ts
├── commands/                 # command runtime, undo/redo inverses, transactions, changes
│   ├── index.ts              # new
│   ├── types.ts
│   ├── runtime.ts
│   ├── change-events.ts
│   └── transaction.ts
├── extensions/               # host extension system: registries + runtime resolution
│   ├── index.ts              # new
│   ├── node-kind-registry.ts
│   ├── command-registry.ts
│   └── canvas-runtime.ts
└── serialize/                # exporters (SVG, PDF); kept as `serialize` — no cosmetic rename
    ├── index.ts              # new
    ├── svg.ts
    └── pdf.ts
```

Optional end-state (Phase 4): per-domain `__tests__/` directories, with `src/__tests__/` retained only for cross-domain suites (`smoke`, `property-roundtrips`).

Deliberately **not** created: `utils/`, `shared/`, `common/` (nothing qualifies — `clock.ts` is a single named seam, not a dump), no `ai/` directory for one 85-line file (promote only when the protocol grows), no splitting of `svg.ts` (995 lines, one responsibility: SVG emission) or `commands/runtime.ts` (832 lines; the command switch is one invariant — `BUILTIN_COMMAND_TYPES` must mirror it — and scattering it per-command would hide that).

---

## 3. Migration table

| # | Old file | New location | Why |
|---|---|---|---|
| 1 | `src/types.ts` | `src/ir/types.ts` | It *is* the IR document model. Ends the "package-wide types" misreading; puts the base layer inside its domain. |
| 2 | `src/ir-validators.ts` | `src/ir/validators.ts` | Prefix → directory. |
| 3 | `src/ir-builders.ts` | `src/ir/builders.ts` | Prefix → directory. |
| 4 | `src/ir-mutations.ts` | `src/ir/mutations.ts` | Prefix → directory. Mutations are pure IR-tree edits (import no geometry) — they belong to the IR domain, with commands layered above. |
| 5 | `src/ir-walkers.ts` | `src/ir/walkers.ts` | Prefix → directory. |
| 6 | `src/extensions/migration-registry.ts` | `src/ir/migrations.ts` | **Fixes the only layering leak.** Version-chain migration is IR wire-format infrastructure (it ships `CANVAS_IR_MIGRATIONS` and is a hard dependency of `migrateCanvasIR`). After the move, `extensions/canvas-runtime` imports it *downward* (extensions → ir), and `ir/` becomes self-contained. Same exported symbols, re-exported from the root barrel — public API unchanged. |
| 7 | `src/geometry.ts` | `src/geometry/affine.ts` | Domain dir + content-accurate member name (its own doc header: "Affine-transform geometry"); avoids `geometry/geometry.ts`. The only rename not forced by a prefix-drop. |
| 8 | `src/viewport.ts` | `src/geometry/viewport.ts` | Joins the spatial domain it already depends on. |
| 9 | `src/hit-test.ts` | `src/geometry/hit-test.ts` | Same. |
| 10 | `src/snap.ts` | `src/geometry/snap.ts` | Same (imports nothing, but is spatial math by responsibility; keeps its deliberate self-containment). |
| 11–14 | `src/commands/{types,runtime,transaction,change-events}.ts` | **stay** | Already a cohesive, correctly-layered domain. |
| 15–17 | `src/extensions/{canvas-runtime,node-kind-registry,command-registry}.ts` | **stay** | Correct home for the host extension system. |
| 18–19 | `src/serialize/{svg,pdf}.ts` | **stay** | Correct domain. `serialize` → `serialization` would be a purely cosmetic rename — skipped per minimal-churn rule. |
| 20 | `src/ai-contracts.ts` | **stay** | Single-file, type-only protocol domain. A directory for one file adds indirection without cohesion. Promote to `ai/` only when the protocol grows past ~2 files. |
| 21 | `src/clock.ts` | **stay** | Cross-cutting deterministic-time seam used by `ir` and `commands`. Narrow, named, single-purpose — the legitimate exception to "no root files". |
| 22 | `src/index.ts` | **stays; rewritten** | Becomes `CANVAS_CORE_VERSION` + six domain-barrel re-exports instead of 20 file re-exports. |
| new | `src/{ir,geometry,commands,extensions,serialize}/index.ts` | created | One entry point per domain (design principle 6); shrinks the root-barrel conflict surface; ready seam for future subpath exports if the bundle budget ever forces splitting. |

Net churn: **10 file moves, 5 new barrels, 1 rewritten barrel, 12 files untouched.** Zero public symbols added, removed, or renamed.

---

## 4. Dependency rules

Layer order (low → high). A domain may import **only strictly lower** rows. All cross-domain type sharing should prefer `import type`.

```
0  clock.ts        (imports nothing)
1  ir/             (zod + clock only)
2  geometry/       ai-contracts.ts     export/    (all: ir only)
3  commands/       (ir, geometry, clock)
4  extensions/     templates/          brand/    (all: ir, commands; zod for schema typing)
5  serialize/      ai-design-contracts.ts    (serialize: ir, geometry, walkers, extensions type-only; ai-design-contracts: ir, commands, templates, brand, ai-contracts type-only)
6  index.ts        (domain barrels only)
```

Per-domain rules:

| Domain | Allowed imports | Forbidden imports | Notes |
|---|---|---|---|
| `clock.ts` | (none) | everything | Stays a leaf forever. |
| `ir/` | `zod`, `clock.ts` | geometry, commands, extensions, serialize, ai-contracts, templates, brand, export | Intra-domain order: `types` < `walkers`/`migrations` < `validators` < `builders`; `mutations` sits on `walkers`. No ir member may import `builders` or `mutations`. |
| `export/` (FR-040) | `ir` only | commands, extensions, serialize, templates, brand | The headless export job contract — types + a document-resolution helper. Never calls the `serialize/` serializers itself; an adapter/worker composes both. Consumed by `templates/resize-to-variants.ts` (canvas-m3-007) to type `buildCampaignExportJobRequest`'s output — the one-way edge templates→export is allowed since templates outranks export; export never imports back. |
| `brand/` (FR-031/FR-032) | `ir`, `commands` (apply-brand transforms wrap edits as a reversible batch, canvas-m2-006), `zod` | extensions, serialize, templates | The canonical Brand Kit contract + apply-brand transforms. Bumped from rank 2 to rank 4 in canvas-m2-006 once `applyBrandColors`/etc. needed `commands/`. Deliberately never referenced by `ir/` — a document holds brand *tokens* (`BrandTokenRef`), never a `BrandKitDefinition`. |
| `geometry/` | `ir` (type-only — true today) | commands, extensions, serialize, clock | Pure math; must stay runtime-value-free w.r.t. IR. |
| `ai-contracts.ts` | `ir` (type-only) | everything else | Must remain a types-only module (`export type *` at the barrel). |
| `commands/` | `ir`, `geometry`, `clock.ts` | extensions, serialize, ai-contracts, templates | Commands orchestrate mutations; they never know about hosts, exporters, or templates. |
| `extensions/` | `ir`, `commands`, `zod` | serialize, geometry (until a concrete need), templates | The registries define contracts; `canvas-runtime` composes them. |
| `templates/` (FR-020..022, FR-060/061) | `ir`, `commands`, `zod`, `export` (type-only, canvas-m3-007) | serialize, geometry, extensions | Template definition/slots/instantiation, the FR-060 size-preset catalog, and FR-061's `resizeToVariants`/`buildCampaignExportJobRequest`. Same rank as `extensions` — neither domain depends on the other. `instantiateTemplate` (canvas-m2-003) and `resizeToVariants` (canvas-m3-007) both wrap their output as a `commands/` batch, same pattern as any other document-mutating feature. |
| `serialize/` | `ir`, `geometry`; `extensions` **type-only** (hook/registry contracts) | commands, clock, templates | Exporters read documents; they never edit them. The extensions edge must stay `import type`. |
| `ai-design-contracts.ts` (FR-050/051/052, canvas-m4-001/002/003) | `ir` types + `ir/validators` schemas (`CanvasNodeSchema`/`CanvasPageSchema`, for canvas-m4-003's quarantine layer), `commands` (`CanvasCommand`/`CanvasBatchCommand` payload shape), `templates` (`CanvasSizePreset` id), `brand` (`BrandKitDefinition`), `ai-contracts.ts` (`AiLayerContext`, `AiImageJobKind`, type-only) | everything at or below its own rank cross-domain (same-rank siblings `serialize/` don't interact) | Design-level AI job contracts (`AiDesignJobRequest`/`Result`, `AiDesignProvider`, `AiProviderCapabilities`) plus `validateAiDesignJobResult` (canvas-m4-003) — NOT types-only, unlike `ai-contracts.ts` (mixes types + real validation logic, like `text-contracts.ts` does at rank 2), hence `export *` not `export type *` at the root barrel. Ranked at 5 (not 2) because it needs those higher domains' types/schemas. `AiDesignJobResult` is status-discriminated (payload only on `"complete"`), mirroring the same fix applied to `AiImageJobResult`. |
| `index.ts` | domain `index.ts` barrels | deep files | The only place the whole package is assembled. |

Internal import convention: **cross-domain imports go direct-to-file (current style), not through sibling barrels.** Barrels are the domain's public face for the root index (and future subpath exports); keeping internal edges file-granular keeps the madge graph precise and makes barrel cycles impossible.

Enforcement: `check:circular` already blocks cycles. Direction can be gated with an optional `scripts/check-layering.mjs` following the package's existing bespoke-gate pattern (`check-react-free`, `check-peer-deps`, …), built on `madge --json` (already installed — **no new dependency**): ~30 lines mapping each `src/` prefix to the rank table above and failing on any upward edge. Recommended but not required for the move itself.

---

## 5. Directory responsibilities

- **`ir/`** — the persisted, collaborative document model: TypeScript types (`types.ts`), Zod wire-format schemas + `migrateCanvasIR` (`validators.ts`), the version chain + migration registry mechanism (`migrations.ts`), typed factories (`builders.ts`), structural traversal with depth guards (`walkers.ts`), and immutable single-pass tree edits (`mutations.ts`). Owns the version constant and the migrate-on-read/write-current policy.
- **`geometry/`** — framework-free spatial math over world coordinates: affine matrices replicating Konva's transform order (`affine.ts`), pan/zoom + screen↔world mapping (`viewport.ts`), rotation-aware hit-testing (`hit-test.ts`), snapping/smart-guides/align-distribute (`snap.ts`).
- **`commands/`** — the editing verb layer: command shapes + shared option types (`types.ts`), the built-in applier with undo inverses (`runtime.ts`), batch/transaction composition with a single composite inverse (`transaction.ts`), and granular change records for autosave/sync consumers (`change-events.ts`).
- **`extensions/`** — how hosts extend core without forking: node-kind, command, (and via `ir/`) migration registration, composed by `createCanvasRuntime` into a resolved runtime with rebuilt schemas; built-ins are unshadowable.
- **`serialize/`** — pure exporters from IR to interchange formats (SVG with extension hook support; PDF layered on SVG). Read-only over documents.
- **`ai-contracts.ts`** — type-only request/placeholder protocol between the engine and AI-producing hosts.
- **`clock.ts`** — the injectable time source that keeps builders/mutations/commands deterministic in tests.
- **`index.ts`** — the single public entry; the only file consumers may resolve.

---

## 6. Refactoring plan (incremental, gate-checked)

Ground rules for every phase: `git mv` inside the `packages/canvas/core` **nested submodule** (`git -C`), fix imports mechanically, run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, then `git add` the moved files **before** `pnpm update:api-snapshot` (the typedoc source-URL gotcha), confirm the snapshot diff is path-only (identical symbol set), keep LF endings, finish with `pnpm check:all`. Commits are user-owned; each phase should land as one commit.

- **Phase 0 — freeze point (now).** Gates verified green on this tree. **Sequencing constraint:** m1-002/006/010/012 are queued and will touch `ir-validators` and `canvas-runtime`; land Phase 1 in the gap between milestone tasks (ideally right after m1-002) — the `ir/` move is the conflict hotspot.
- **Phase 1 — create `ir/` (the whole payoff).** Move files 1–6 from the table. This is the phase that fixes the layering leak: `validators` then imports `./migrations.js` (sibling), and `extensions/canvas-runtime` imports `../ir/migrations.js` (downward). Update: root `index.ts` paths, ~10 importer files, and the two pinned vitest coverage excludes (`src/types.ts` → `src/ir/types.ts`). No shims needed — consumers only see the root barrel, and the phase is atomic.
- **Phase 2 — create `geometry/`.** Move files 7–10; update ~5 importers (`viewport`, `hit-test`, `commands/runtime`, `serialize/svg`) and the root barrel.
- **Phase 3 — domain barrels + slim root.** Add the five `index.ts` barrels; rewrite root `index.ts` to six re-exports. **Preserve type-only semantics**: `ir/index.ts` must use `export type * from "./types.js"` (matching today's root), and `ai-contracts` stays `export type *` at the root. Regenerate the api snapshot and review once for typedoc re-export-chain reshuffling (structural, not symbol, drift is acceptable). Optionally add `scripts/check-layering.mjs` here.
- **Phase 4 (optional, lowest priority) — co-locate tests.** Move per-domain tests into `src/<domain>/__tests__/` (vitest's `src/**` include already matches), moving `__snapshots__/` alongside `svg-golden.test.ts`; keep `smoke` and `property-roundtrips` in the central `src/__tests__/` as declared cross-domain suites. Skip entirely if churn budget is tight — it is independent of Phases 1–3.

### Risk register

| Risk | Mitigation |
|---|---|
| api-snapshot drift from moved source URLs | Known-benign pattern in this repo; `git add` before regen; verify symbol set unchanged; never hand-edit; keep LF (WSL autocrlf gotcha). |
| Parallel M1 tasks conflict on `ir-validators`/`canvas-runtime` | Phase sequencing above; each phase is a single small window. |
| Auto-commit hook fires mid-move | Do move + import fixes in one uninterrupted pass, then gates. |
| Bundleless dist paths change | Private — `exports` map exposes only `"."`; publint gate confirms. |
| `check-bundle-budget` mis-picks a chunk after layout change | Known latent bug pattern in sibling packages' copies of the script; core emits no lazy chunks, but if the budget gate fails oddly, check *which* file it measured before assuming a regression. |
| Editor snap/geometry re-export shims | They re-export from the package root — unaffected. |

### Explicitly rejected options

- **`utils/` / `shared/`** — nothing homeless exists; `clock.ts` is a named seam.
- **Splitting `svg.ts` or `commands/runtime.ts` by size** — single responsibilities; length alone is not a split criterion.
- **`serialize/` → `serialization/`** — cosmetic rename, forbidden by the minimal-churn rule.
- **A top-level `mutations/` layer** (to mirror the conceptual IR→Geometry→Mutations→Commands diagram) — the code shows mutations import *no* geometry; they are IR-tree operations. Domain cohesion beats diagram literalism; the direction rules in §4 still encode the diagram's intent (commands sit above both).
- **dependency-cruiser** for layering enforcement — madge is already installed and the repo's house pattern is bespoke `scripts/check-*.mjs` gates; a new dependency is unjustified.
- **Re-homing `CanvasPoint`/`CanvasRect` into geometry** — worthwhile someday, but it is type-surface surgery, not layout; deferred with a re-export-compat sketch in §1.
