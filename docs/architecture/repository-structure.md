# Repository Structure

**Status:** Accepted Phase 0 architecture contract

**Last verified:** 2026-07-11
**Related decisions:** [package layering](../adr/0001-package-layering.md), [submodule policy](../adr/0002-submodule-policy.md), [Studio/platform boundary](../adr/0003-studio-platform-boundary.md), [reference app and playground](../adr/0004-reference-app-and-playground.md)

This document is the canonical source of truth for repository positioning, directory responsibilities, dependency direction, package placement, application roles, ownership expectations, and the phased restructure. Root guides must summarize and link here instead of maintaining competing maps.

## Product Positioning

`anvilkit-studio` is AnvilKit's frontend SDK, Studio runtime, extension ecosystem, reference product, documentation and marketplace application, integration suite, and frontend-oriented developer tooling. It is not only a React component monorepo.

The repository currently coordinates:

- the Puck-native Studio runtime and plugin lifecycle;
- React UI primitives and independently published components;
- Page IR, shared contracts, schema derivation, validation, and trust boundaries;
- analytics and canvas capabilities;
- independently published plugins and templates;
- CLI and plugin scaffolding packages;
- a full Studio reference application and a documentation/marketplace application;
- examples, integration tests, benchmarks, Changesets, and shared engineering configuration;
- Git submodules and local/production-oriented container configuration; and
- a standalone Hocuspocus collaboration relay pending extraction to `anvilkit-platform`.

## Architecture Layers

The product dependency graph is strictly top-down:

```text
apps
  -> extensions
    -> capabilities
      -> runtime
        -> foundation
```

An upper layer may depend on the layers below it. A lower layer must not depend on a layer above it. A package may omit intermediate layers; for example, an extension may directly use foundation contracts.

Repository engineering tools sit outside the product dependency graph, but they divide into two kinds with different dependency rules:

- **Repository tooling** — shared engineering configuration (`packages/tooling/configs`) and root automation (`scripts/`). Consumed only as devDependencies; it must never be a runtime dependency of any package or app.
- **Distribution tools** — published command-line products (`packages/tooling/cli`, `packages/tooling/create-plugin`). These sit at *app altitude*: they may depend downward on any product layer (foundation through extensions), but no package or app may depend on them. `@anvilkit/cli`'s dependencies on `core`, `ir`, `schema`, `validator`, and several plugins are therefore expected, not a layering violation (2026-07-11 review, DIR-008).

```text
repo tooling (configs, scripts)          -- devDependency only --> packages and apps
distribution tools (cli, create-plugin)  -- may depend downward --> foundation .. extensions
                                         -- never depended upon --> (no package or app)
```

### Foundation

Foundation is framework-independent and React-free. The target set is `contracts`, `utils`, `ir`, `schema`, and `validator`. The verified current graph includes `schema -> contracts`, `validator -> contracts, schema`, and `ir -> contracts, utils`. Since Phase 4 (2026-07-10), the `@anvilkit/utils` main entry is React-free: `getStrictContext` is published only via the `@anvilkit/utils/get-strict-context` subpath and is excluded from the barrel, guarded by the package's `check:react-free-entry` gate. The physical `packages/utils -> packages/foundation/utils` move is complete (Phase 3, 2026-07-10).

Allowed target edges:

```text
contracts -> (no AnvilKit runtime package)
utils     -> (no AnvilKit runtime package)
schema    -> contracts, utils
validator -> contracts, schema, utils
ir        -> contracts, utils
```

Foundation must not import runtime, capabilities, extensions, or apps.

### Runtime

Runtime contains the minimum generic Studio host: plugin contracts and compilation, lifecycle management, registration, extension host interfaces, generic configuration and errors, the generic Studio shell, and generic state projections. `@anvilkit/ui` contains shared Studio-agnostic React primitives.

Runtime may define adapter interfaces and lifecycle events for optional systems. It must not own or depend on concrete analytics, canvas, AI provider, SEO, asset management, collaboration provider, exporter, persistence, or dashboard implementations.

The required invariant is:

```text
runtime -X-> capabilities
runtime -X-> extensions
```

This invariant holds since Phase 4 (2026-07-10): the former `@anvilkit/core -> @anvilkit/analytics-core` production dependency was replaced by the runtime-owned `StudioAnalyticsPort` (`packages/runtime/core/src/shared/analytics-port.ts`); `@anvilkit/analytics-core` remains only a devDependency for boundary-compat tests. Core's `check:no-headless-import` gate now enforces the full rule — shipped `src/` may import no `@anvilkit/*` package outside `contracts`/`ui`/`utils`.

#### `@anvilkit/core` internal boundaries and split trigger

Per the 2026-07-11 repository directory design review (finding DIR-006), `@anvilkit/core` (`packages/runtime/core`, 411 source files) intentionally ships as **one package on one version line**, but its `package.json` `exports` map declares **13 subpaths that function as formal *internal* package boundaries**. Consumers import through these subpaths; deep-reaching into `src/` is not supported, and the subpath set is the de-facto module map — narrowing it is a breaking change.

```text
.                  barrel — full Studio surface (pulls in @dnd-kit; avoid in test/SSR paths)
./types            shared runtime types
./runtime          plugin runtime, event bus, compile (src/runtime, 27 files) —
                   the plugin-contract surface all 12 plugins peer-depend on
./config           config + StudioConfig, @dnd-kit-free (import this in test/SSR paths)
./i18n             message registry + resolver (src/i18n, 9 files)
./i18n/icu         ICU formatting entry
./react            React bindings and hooks (src/react, 84 files)
./react/overrides  Puck override adapters
./compat           back-compatibility shims
./testing          test utilities
./templates        template config surface
./section          section primitives
./styles.css       compiled stylesheet — rebuilt by build:css AFTER rslib build
                   (`rslib build` alone WIPES it; run the full package build)
```

Weight is concentrated in editor chrome: `src/studio/` (chrome, layout, theme) is 217 files — more than half the package — against `src/runtime/` at 27. The fast-moving product UI (`studio`, `react`) and the stable plugin-contract surface (`runtime`, `config`, `types`) therefore share one release cadence: every chrome change republishes the contract package.

**Enforcement (machine-guarded, not merely documented):**

- `check:no-headless-import` (`packages/runtime/core/scripts/check-no-headless-import.mjs`, part of `check:all`) forbids shipped `src/` from importing any `@anvilkit/*` package outside the `contracts`/`ui`/`utils` allowlist — with one directory-scoped exception (DD-0019 §6.4, PLAN-0020 CORE-P0-016): the React-free editor engine `src/editor/` (the `./editor` subpath) may import `contracts`/`schema`/`ir`/`utils` and never `ui`. Core therefore carries `@anvilkit/schema` as a production dependency since the visual-editor Phase 0.
- `packages/runtime/core/src/__tests__/forbidden-imports.test.ts` statically bans `konva`/`react-konva`/`@anvilkit/canvas-*` from the runtime.
- Per-subpath API snapshots (`check:api-snapshot-*` for `.`, `runtime`, `config`, `i18n`, `icu`, `react`, `templates`, and — since visual-editor Phase 0 — `editor`, `react-editor`, `testing-editor`) gate each boundary's public surface independently, so a change to one subpath cannot silently alter another. Core's React-free surface is now `./runtime` + `./config` + `./types` + `./editor`; `./react/editor` and `./testing/editor` are the React-side and fixture-side editor boundaries. The editor snapshots are generated with `--disableSources` so they stay byte-stable regardless of git tracking state.

**Split trigger (explicit).** Do **not** split `@anvilkit/core` now — splitting trades the "prefer boring" and public-API-stability rules for speculative benefit while the fixed release group and single maintainer absorb the coupling cost. Extract the plugin-contract/runtime surface (`./runtime` + `./config` + `./types`, plus the React-free `./editor` engine since visual-editor Phase 0) — or, symmetrically, the studio chrome — into an independently versioned package **only when one of these concrete conditions holds**:

- a **second host application** needs the plugin-contract surface at a version independent of the editor chrome; or
- a **third-party plugin ecosystem** exists whose plugins pin `@anvilkit/core` as a peer and are being churned by chrome-only releases.

Until a trigger fires, the 13 subpaths are the boundary and the gates above are the enforcement. Recording the trigger converts a future emergency split into a planned one.

### Capabilities

Capabilities are optional, first-party systems larger than ordinary plugins. Analytics (`core`, `react`) and Canvas (`core`, `editor`) belong here. Capabilities may depend on runtime and foundation. Runtime must never depend on them.

### Extensions

Components, templates, and plugins are installable extensions. They may depend on capabilities, runtime, and foundation through public package exports. One extension must not import another extension's private source path. Shared behavior belongs in a public package contract only when multiple real consumers justify it.

### Apps

Apps compose all lower layers. No package may import from `apps/*`.

- `apps/studio` is the complete product-grade reference implementation (renamed from `apps/demo` in Phase 1). It owns product workflows, persistence adapters, publishing, collaboration, analytics dashboards, AI and Canvas integration, first-party plugin composition, product routes, and navigation.
- `apps/playground` is a minimal integration and compatibility surface for public exports, Puck editor/render, SSR, RSC, peers, reproductions, and Playwright (introduced in Phase 1 with initial editor/render smoke coverage; remaining compatibility duties migrate incrementally). It must not accumulate databases, dashboards, full navigation, production collaboration infrastructure, or unrelated product workflows.
- `apps/docs` owns Fumadocs content on TanStack Start/Vite, API reference generation, the marketplace, and lightweight examples. It must not become a second full Studio product.

## Verified Current Structure

This is the physical structure after the Phase 3 package-path migration (2026-07-10). Package paths now express layers; npm names, exports, and versions were preserved:

```text
apps/
  collab/                standalone Node/Hocuspocus service, not a pnpm workspace
  playground/            minimal public-export compatibility app (added in Phase 1)
  studio/                full Next.js product plus compatibility tests (was demo/)
  docs/                  TanStack Start/Vite/Fumadocs docs and marketplace
packages/
  capabilities/
    analytics/{core,react}/  submodule packages
    canvas/{core,editor}/    submodule packages
  extensions/
    components/              submodule containing 12 component workspaces
    plugins/*/               12 submodule packages
    templates/               11 template workspaces plus an aggregate workspace
  foundation/{contracts,ir,schema,utils,validator}/  utils main entry React-free (Phase 4)
  runtime/{core,ui}/
  tooling/
    cli/
    configs/{biome,tailwind,typescript,vitest}/
    create-plugin/
scripts/
docker-compose.yml
Caddyfile
```

`.gitmodules` is the only canonical submodule inventory. It currently declares 17 gitlinks: one component workspace, 12 plugins, two Canvas packages, and two analytics packages.

## Target Structure

The initial proposal is accepted with two evidence-based adjustments: `contracts` is added to foundation, and `benchmarks/` is the future home for a performance harness (the previous root `bench/` harness has been removed and is recreated only when a working harness exists).

```text
apps/
  studio/
  playground/
  docs/
packages/
  foundation/{contracts,utils,ir,schema,validator}/
  runtime/{core,ui}/
  capabilities/analytics/{core,react}/
  capabilities/canvas/{core,editor}/
  extensions/{components,templates,plugins}/
  tooling/{cli,create-plugin,configs/{biome,tailwind,typescript,vitest}}/
examples/{plugins,adapters,recipes}/
tests/{contracts,compatibility,fixtures}/
benchmarks/
docs/{architecture,adr,plans,reviews,policies,migration,security,operations}/
tooling/{scripts,generators,repo}/
infra/local/
```

Physical moves do not rename npm packages. For example, `packages/foundation/ir` continues to publish as `@anvilkit/ir`; package exports and repository metadata remain compatible.

## Package Placement Policy

Place code by responsibility, not by framework or release status:

1. Put framework-independent shared data shapes, transforms, and validation in foundation.
2. Put only the minimum generic Studio host and shared runtime UI in runtime.
3. Put optional first-party product systems with multiple packages or substantial domain logic in capabilities.
4. Put installable components, templates, and plugins in extensions.
5. Put complete compositions and deployment entry points in apps.
6. Put shared engineering configuration (biome/tailwind/typescript/vitest) in `packages/tooling/configs`; it is repository tooling, consumed only as devDependencies.
7. Put publishable distribution tools (`cli`, `create-plugin`) in `packages/tooling`; they sit at app altitude and may depend downward on product packages, but must never be a dependency of any package or app.
8. Put non-publishable repository automation in root `tooling`.
9. Put examples in `examples`, cross-package contracts/compatibility fixtures in `tests`, and performance workloads in `benchmarks`.

When classification is ambiguous, choose the lowest layer whose responsibility is complete without importing upward. Document exceptions in an ADR.

## Package Creation Rules

Before creating a workspace project:

1. Confirm an existing package or platform API cannot own the behavior.
2. State its layer, public API, consumers, owner, release owner, and lifecycle.
3. Validate every dependency edge against this document.
4. Decide monorepo versus independent repository using the submodule policy below; monorepo is the default.
5. Preserve the shared Node.js, pnpm, TypeScript, React, and Puck baselines unless an evidenced compatibility requirement demands an exception.
6. Add standard build, lint, typecheck, test, publint, and Changesets behavior appropriate to whether it is public or private.
7. Add package smoke coverage to the future playground and boundary coverage to repository CI.

## Submodule Policy

Do not create a submodule for every new package.

Keep a package in the monorepo when it has the same maintainers, changes frequently with runtime, must be tested against runtime changes, shares the React/Puck/Node/TypeScript baseline, needs no separate access control, or gains no clear operational benefit from separate ownership.

Consider an independent repository or submodule only when it has independent maintainers and release ownership, works meaningfully outside Studio, needs separate permissions or security auditing, changes across repositories are uncommon, and separation provides a concrete operational benefit. An independent repository does not automatically require a submodule; use a registry dependency when source-level coordination is unnecessary.

Every retained submodule must record:

- repository owner and release owner;
- Node.js engine and exact pnpm version;
- React and Puck peer ranges and TypeScript baseline;
- required build, lint, typecheck, test, and publint commands;
- Changesets/versioning policy and npm access;
- CI expectations, clean-clone behavior, and compatibility matrix; and
- the parent repository process for updating and releasing the gitlink.

Submodule paths may move only in a dedicated PR that preserves history, updates `.gitmodules` and gitlinks atomically, verifies recursive clone/install, and coordinates any repository metadata or CI path filters.

### Retention decision (2026-07-11)

The 2026-07-11 repository directory design review recommended absorbing all 17 submodules into the monorepo. That recommendation is **declined**: the submodules are retained as-is. Retention carries one forward-looking requirement — **every new plugin must be independently runnable**: it must install, build, and test standalone, without a nested workspace reaching into the superproject. Existing submodules are grandfathered; the `packages/extensions/components` submodule, whose nested workspace currently reaches into the superproject, is the known exception and must not set precedent for new plugins.

## Studio and Platform Boundary

`apps/collab` is a production-capable backend service, not a frontend app. It has a standalone lockfile, Node engine, Hocuspocus runtime, Dockerfile, Fly configuration, Redis persistence/pub-sub, origin controls, scaling concerns, and an independent deployment lifecycle. Its target is:

```text
anvilkit-platform/services/collab-relay
```

The Studio repository will retain client contracts, local relay fixtures, and local-only integration topology under `infra/local/`. Extraction must not begin until the platform repository provides service ownership, image publishing, secrets, observability, rollback, and an externally versioned WebSocket contract.

Affected surfaces include `apps/collab`, `.github/workflows/docker-images.yml`, `docker-compose.yml`, `Caddyfile`, root and service `.env.example` files, `apps/studio` collaboration configuration and scripts, docs playground relay configuration, GHCR image `ghcr.io/ancyloce/collab`, Fly deployment, `COLLAB_HOCUSPOCUS_URL`, `COLLAB_PUBLIC_WS_URL`, `COLLAB_ALLOWED_ORIGINS`, `DEMO_ALLOWED_ORIGINS`, `REDIS_URL`, `PUBLIC_DOMAIN`, and `/collab-ws` proxy routing.

The safe order is contract definition, platform deployment in parallel, non-production client validation, production traffic migration, observation, then removal of production service/deployment ownership here. Rollback keeps the existing Studio-hosted image and route deployable until the platform service passes the agreed observation window.

## CI Ownership

The root repository owns cross-layer boundary validation, clean recursive checkout/install, workspace graph validation, apps, examples, compatibility tests, docs generation/build, and integration gates. Each package owns its local build, lint, typecheck, test, publint, API snapshot, and size checks. Each retained submodule must run its contract locally and be revalidated from the pinned gitlink in root CI.

CI will become path-aware only after dependency boundaries and package classifications are machine-enforced. Changes to runtime must validate its full dependent cone; changes confined to an app must not trigger npm publication gates.

## Release Ownership

Public npm names and exports remain stable through path migration. Changesets is authoritative for package versions; package versions must not be edited as part of directory moves. The current fixed Changesets group represents coordinated release behavior for the runtime cone and several plugins, while other public submodule packages have independent repositories and version lines. Phase 5 must make release ownership explicit rather than infer it from location.

Apps and the collaboration relay are deployable artifacts, not npm releases. The platform repository will own the relay image and production deployment after extraction. Unknown human owners remain explicitly `unknown` until CODEOWNERS or equivalent repository evidence is added.

## Dependency Enforcement

`pnpm madge` detects cycles, not forbidden one-way imports. The repository has package-local source scanners, including core's headless-import gate, but no workspace-wide architectural path enforcement. Phase 0 does not add a dependency because physical paths are still flat, submodules have separate lifecycles, and a correct rollout needs an audited baseline and exclusions.

Phase 1/PR 2 should add `dependency-cruiser` as a root development tool with rules for all layer prohibitions, application imports, and cross-extension private imports. It must consume TypeScript resolution, exclude generated/build/fixture output, report existing violations explicitly, and replace overlapping custom path scanners only after parity tests prove equivalent coverage.

### Duplicated release-gate scripts (2026-07-11)

The 2026-07-11 review (finding DIR-009) found the per-package release-gate scripts — `check-peer-deps`, `check-bundle-budget`, `check-api-snapshot`, `check-react-free`, `check-publint` — copied across roughly sixteen packages, with at least one correction (the `check-bundle-budget` `findEntryChunk` fix) landed in only a single copy. The review's remedy was to extract them into one private `@anvilkit/package-checks`, **sequenced to run after submodule absorption** so that every copy would live in one repository.

That prerequisite no longer holds: absorption is declined (see the Submodule Policy retention decision), so the copies remain spread across the runtime and foundation packages and the 13-plus submodule repositories. Consolidation is therefore **deferred** — undertaking it now would require coordinated edits across every submodule repository, the precise cross-repo cost the review's sequencing was meant to avoid. Revisit it only together with the `dependency-cruiser` adoption above, as one workspace-wide enforcement effort. Until then, any gate-script fix (notably the `findEntryChunk` correction) must be propagated to every copy by hand.

## Migration Strategy

The restructure is intentionally phased:

1. Phase 0: governance, verified inventory, ADRs, documentation correction, and migration plan.
2. Phase 1: clarify app responsibilities, rename `demo` to `studio`, and add the minimal playground.
3. Phase 2: extract the production collaboration relay and retain local integration infrastructure.
4. Phase 3: move physical package paths without npm/export/version changes.
5. Phase 4: remove invalid runtime dependency edges and relocate concrete product features.
6. Phase 5: make CI and releases path-aware while preserving full dependent-cone validation.

The detailed sequence, inventory, impact list, risks, and rollback procedure live in the Phase 0 migration plan (`docs/plans/0001-anvilkit-studio-repository-restructure-0709-1739.md`, an untracked working document).
