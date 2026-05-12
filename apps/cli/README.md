# anvilkit

The `anvilkit` CLI — the user-facing entry point for scaffolding, registry installs, validation, export, and AI generation against an Anvilkit Studio project.

## Commands

```sh
anvilkit init [dir] [--template <slug>] [--pm pnpm|npm|yarn|bun] [--force] [--no-input]
anvilkit add <slug> [--write] [--unsafe] [--no-install] [--pm <pm>] [--cwd <path>]
                    [--puck-config <path>] [--next-config <path>] [--feed <source>] [--kind <kind>]
anvilkit validate <file> [--format pretty|json] [--no-input]
anvilkit export <input> --format html|react --out <dir> [--from puck] [--config <path>]
                                            [--inline-assets] [--syntax tsx|jsx]
                                            [--asset-strategy url-prop|inline] [--force] [--no-input]
anvilkit generate "<prompt>" --config <path> --out <path|-> [--mock] [--format pretty|json] [--no-input]
```

All five commands are implemented and registered in [`src/bin/anvilkit.ts`](./src/bin/anvilkit.ts):

- **`init`** — scaffolds a new Anvilkit project (Next.js + Studio shell), with optional template + package-manager prompts.
- **`add`** — installs a plugin, template, or component from the registry; defaults to a dry-run, `--write` applies the codemod against the host's Puck and Next configs.
- **`validate`** — runs `validateComponentConfig` from `@anvilkit/validator` against a source file.
- **`export`** — exports IR through the html/react formatters in `@anvilkit/plugin-export-*`.
- **`generate`** — calls `configToAiContext` + `validateAiOutput` to produce a validated PageIR from an AI prompt; `--mock` skips the network call.

## Development

```sh
pnpm build        # rslib build (ESM-only)
pnpm dev          # rslib build --watch
pnpm test         # vitest run
pnpm typecheck    # tsc --noEmit
pnpm lint         # biome lint
pnpm check:all    # lint + typecheck + test + build + publint + circular + react-free check
```

The `check:react-free-runtime` gate guarantees `src/` (excluding `scaffolds/`) has no `import … from "react"` — the CLI must remain runnable in a Node-only environment.

## Layout

```
apps/cli/
├── src/
│   ├── bin/anvilkit.ts        # entry point, command registration
│   ├── commands/              # init.ts, add.ts, validate.ts, export.ts, generate.ts
│   ├── scaffolds/             # embedded files for `init`
│   └── utils/                 # logger, errors, atomic-write helpers, prompt helpers
└── scripts/postbuild.mjs      # makes the built bin executable
```
