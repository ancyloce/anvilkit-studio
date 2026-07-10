# @anvilkit/typescript-config

Shared `tsconfig.json` presets for the anvilkit-studio workspace.
Private — not published to npm.

## Presets

| File                 | Use when…                                                                               |
| -------------------- | --------------------------------------------------------------------------------------- |
| `base.json`          | Plain TypeScript packages with no React surface (`ir`, `schema`, `validator`, `utils`). |
| `react-library.json` | React libraries that ship `.d.ts` for both CJS and ESM (`core`, `ui`, every plugin).    |
| `nextjs.json`        | Next.js apps. Used by `apps/studio`.                                                      |

All three enable `strict` and `isolatedModules`. Packages that bundle
their own `.d.ts` also turn on `verbatimModuleSyntax` (via the
`react-library-bundler.json` preset or a per-package override) — use
`import type` for type-only imports.

## Usage

```json
{
  "extends": "@anvilkit/typescript-config/react-library",
  "include": ["src"],
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

Per-package `tsconfig.json` files should only set `include`,
`outDir`, and the minimum overrides needed — everything else flows
from the preset.
