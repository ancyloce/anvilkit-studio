# @anvilkit/ir

Headless transforms that turn Puck `Data` into the normalized
[`PageIR`](../core/src/types/ir.ts) shape every Anvilkit export
format consumes. `@anvilkit/ir` is the first of three headless
runtime packages (`ir`, `schema`, `validator`) and sits directly
above `@anvilkit/utils` in the dependency graph — it imports zero
React, no DOM, and no other `@anvilkit/*` runtime.

> **Alpha status (0.1.x).** The four public exports are implemented
> and covered by round-trip, canonical-form, and snapshot tests.
> The IR shape is **frozen at end of M1** — any change requires a
> Core minor bump and an `ir_shape_changed` changeset.

## Install

```bash
pnpm add @anvilkit/ir @anvilkit/core @puckeditor/core
```

## Quickstart

```ts
import { puckDataToIR, irToPuckData } from "@anvilkit/ir";
import type { Config, Data } from "@puckeditor/core";

declare const config: Config;
declare const data: Data;

// Normalize Puck data into the IR shape exporters consume.
const ir = puckDataToIR(data, config);

// Rebuild the original Puck data from an IR document.
const roundTripped = irToPuckData(ir);
```

## Phase 3 references

See the [Phase 3 plan](../../docs/plans/phase-3-export-ai-pipeline-plan.md)
(`M1 — @anvilkit/ir`) and the
[architecture package catalog](../../docs/ai-context/anvilkit-architecture.md)
(`§7 — @anvilkit/ir [Planned]`) for the IR contract, dependency
direction, and release expectations.

## Public API

| Export           | Signature                                                          | Purpose                                                                                              |
| ---------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `puckDataToIR`   | `(data: Data, config: Config) => PageIR`                           | Normalize a Puck document into a JSON-serializable `PageIR`.                                         |
| `irToPuckData`   | `(ir: PageIR) => Data`                                             | Reverse of `puckDataToIR` — used for round-trip tests and the AI copilot's `setData` dispatch.       |
| `collectAssets`  | `(node: PageIRNode) => readonly PageIRAsset[]`                     | Walk a sub-tree and collect every referenced asset, deduplicated.                                    |
| `identifySlots`  | `(config: Config) => Map<string, readonly string[]>`               | Inspect a Puck `Config` and return the slot-field keys declared on each component.                   |

## Peer dependencies

| Package | Version |
| ------- | ------- |
| `@anvilkit/core` | `0.1.0-alpha.0` |
| `@puckeditor/core` | `^0.21.0` |

## Dependency contract

| Allowed                       | Forbidden                                                               |
| ----------------------------- | ----------------------------------------------------------------------- |
| `@anvilkit/utils` (runtime), `@anvilkit/core` (peer, types-only) | `@anvilkit/schema`, `@anvilkit/validator`, `@anvilkit/core` runtime |
| `@puckeditor/core` (peer, types-only) | React, ReactDOM, any plugin package, any DOM API                |

CI enforces these with `madge --circular`, `check:react-free-runtime`,
and `check:peer-deps` gates (land in `phase3-015`). See
[Phase 3 plan §8](../../docs/plans/phase-3-export-ai-pipeline-plan.md)
and the [architecture doc §8 L441-L487](../../docs/ai-context/anvilkit-architecture.md)
for the full rationale.

## Snapshots

The [`src/__tests__/__snapshots__/`](src/__tests__/__snapshots__/) directory
contains 9 committed `.snap.ts` files — one for each demo component. Each
file exports a typed `PageIR` constant that compiles under the package's
own TypeScript config, so any IR shape drift surfaces as both a test failure
**and** a type error.

Snapshot tests run as part of `pnpm --filter @anvilkit/ir test`. They
assert that `puckDataToIR(fixture, config)` produces output structurally
equal to the committed snapshot, and that two consecutive runs produce
byte-identical output (determinism).

### IR shape freeze rule

The `PageIR` shape is **frozen at end of M1**. After this milestone:

- Any change to `PageIR`, `PageIRNode`, `PageIRAsset`, or
  `PageIRMetadata` requires a **Core minor bump**.
- The PR must include an `ir_shape_changed` changeset.
- All 9 snapshot files must be regenerated and re-committed.

This policy ensures downstream exporters and the AI copilot plugin can
pin against a stable contract.
