# anvilkit

This directory is the phase5-007 source artifact for the future `apps/cli/`
workspace package. It keeps the phase5-006 ESM-only CLI scaffold, replaces the
`init` stub with a working Next.js project generator, and adds the embedded
scaffold files plus prompt/package-manager helpers that `anvilkit init` needs.

## Commands

```sh
anvilkit init [dir] [--template <slug>] [--pm pnpm|npm|yarn|bun] [--force] [--no-input]
anvilkit validate <file> [--format pretty|json] [--no-input]
anvilkit export <input> --format html|react --out <dir> [--from puck] [--config <path>] [--inline-assets] [--syntax tsx|jsx] [--asset-strategy url-prop|inline] [--force] [--no-input]
anvilkit generate "<prompt>" --config <path> --out <path|-> [--mock] [--format pretty|json] [--no-input]
```

## Development

```sh
pnpm build
pnpm test
pnpm check:all
```

At this stage, `init` is implemented and the remaining commands still surface
their placeholder behavior from the scaffold task.
