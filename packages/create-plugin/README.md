# @anvilkit/create-plugin

Scaffold a ready-to-build [Anvilkit Studio](https://github.com/ancyloce/anvilkit-studio)
StudioPlugin package.

## Use

```bash
# non-interactive
pnpm create @anvilkit/plugin \
  --name my-plugin \
  --display "My Plugin" \
  --category rail-panel

# interactive (prompts for name, display, category)
pnpm create @anvilkit/plugin
```

## Flags

| Flag          | Description                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--name`      | Package slug (folder name + `@anvilkit/plugin-<slug>`)                                                                     |
| `--display`   | Human-readable plugin name                                                                                                 |
| `--category`  | `export`, `ai`, `rail-panel`, or `custom`                                                                                  |
| `--dir`       | Parent directory for the generated folder (default: cwd)                                                                   |
| `--overwrite` | Overwrite template files in an existing non-empty target folder. Files NOT in the template are kept. No backup, no prompt. |
| `--help`      | Show help                                                                                                                  |
| `--version`   | Print the installed CLI version                                                                                            |

## What you get

```
my-plugin/
├── package.json       # @anvilkit/plugin-my-plugin, peer-deps on core + Puck + React
├── tsconfig.json      # strict, ESM, NodeNext-like resolution
├── biome.json         # minimal linter + formatter
├── rslib.config.ts    # ESM + CJS + .d.ts build
├── vitest.config.ts
├── src/
│   ├── index.ts                     # createMyPluginPlugin() factory
│   └── __tests__/my-plugin.test.ts  # green baseline test
└── README.md
```

Generated output passes `pnpm install && pnpm build && pnpm test`
out of the box.

## Reference

- Plugin authoring guide: https://github.com/ancyloce/anvilkit-studio/blob/main/apps/docs/content/docs/guides/plugin-authoring.mdx
- StudioPlugin contract: [`@anvilkit/core` README](https://github.com/ancyloce/anvilkit-studio/blob/main/packages/core/README.md)
