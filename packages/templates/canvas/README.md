# `@anvilkit/canvas-templates`

Ten starter [`CanvasIR`](../../capabilities/canvas/core/src/types.ts) designs shipped
with AnvilKit Canvas Studio — posters, social formats, slides, and print
pieces. Each one is a self-contained `CanvasIR` (text / rect / ellipse /
line nodes only, no external assets) so it loads with zero network calls.

## Contract

`src/index.ts` exports a typed `canvasTemplates` registry (slug →
`{ slug, name, description, ir }`) plus `canvasTemplateList`. Every `ir`
validates against `CanvasIRSchema` from `@anvilkit/canvas-core` — enforced
by `src/__tests__/canvas-templates.test.ts`.

```ts
import { canvasTemplates, canvasTemplateList } from "@anvilkit/canvas-templates";

const poster = canvasTemplates.poster.ir; // CanvasIR
```

## Layout

```
packages/templates/canvas/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts                 # typed registry (default export per slug)
    ├── *.json                   # one committed CanvasIR per template
    └── __tests__/
        └── canvas-templates.test.ts
```

The `*.json` files are authored by
[`../scripts/scaffold-canvas-irs.mjs`](../scripts/scaffold-canvas-irs.mjs)
and committed so diffs are reviewable. Re-run
`pnpm --filter @anvilkit/templates-workspace scaffold:canvas-irs` to
regenerate them from the declarative table.

## Build

`tsc` copies the imported `*.json` into `dist/` (via `resolveJsonModule`),
matching the Puck `@anvilkit/template-*` packages alongside this folder.
The dir is skipped by `scripts/verify-templates.mjs` (which validates the
Puck `AnvilkitTemplate` packages) and validated by its own Vitest suite.
