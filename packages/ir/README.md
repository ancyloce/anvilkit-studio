# @anvilkit/ir

Headless transforms that turn Puck `Data` into the normalized
[`PageIR`](../core/src/types/ir.ts) shape every Anvilkit export
format consumes. `@anvilkit/ir` is the first of three headless
runtime packages (`ir`, `schema`, `validator`) and sits directly
above `@anvilkit/utils` in the dependency graph — it imports zero
React, no DOM, and no other `@anvilkit/*` runtime.

> **Alpha status.** Phase 3 (`phase3-002`) ships the package
> scaffold and public barrel. The four exported functions are
> throwing stubs today; real implementations land in `phase3-003`
> (core transforms + round-trip) and `phase3-004` (asset + slot
> helpers + snapshot fixtures).

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

## Public API

| Export           | Signature                                                          | Purpose                                                                                              |
| ---------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `puckDataToIR`   | `(data: Data, config: Config) => PageIR`                           | Normalize a Puck document into a JSON-serializable `PageIR`.                                         |
| `irToPuckData`   | `(ir: PageIR) => Data`                                             | Reverse of `puckDataToIR` — used for round-trip tests and the AI copilot's `setData` dispatch.       |
| `collectAssets`  | `(node: PageIRNode) => readonly PageIRAsset[]`                     | Walk a sub-tree and collect every referenced asset, deduplicated.                                    |
| `identifySlots`  | `(config: Config) => Map<string, ReadonlySet<string>>`             | Inspect a Puck `Config` and return the slot-field keys declared on each component.                   |

## Dependency contract

| Allowed                       | Forbidden                                                               |
| ----------------------------- | ----------------------------------------------------------------------- |
| `@anvilkit/utils` (runtime)   | `@anvilkit/schema`, `@anvilkit/validator`, `@anvilkit/core` runtime     |
| `@puckeditor/core` (peer, types-only) | React, ReactDOM, any plugin package, any DOM API                |

CI enforces these with `madge --circular`, `check:react-free-runtime`,
and `check:peer-deps` gates (land in `phase3-015`). See
[Phase 3 plan §8](../../docs/plans/phase-3-export-ai-pipeline-plan.md)
and the [architecture doc §8 L441-L487](../../docs/ai-context/anvilkit-architecture.md)
for the full rationale.
