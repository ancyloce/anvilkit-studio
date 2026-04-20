# create-anvilkit-plugin

Scaffold a ready-to-build [Anvilkit Studio](https://github.com/ancyloce/anvilkit-studio)
StudioPlugin package.

## Use

```bash
# non-interactive
pnpm dlx create-anvilkit-plugin \
  --name my-plugin \
  --display "My Plugin" \
  --category rail-panel

# interactive (prompts for name, display, category)
pnpm dlx create-anvilkit-plugin
```

## Flags

| Flag         | Description                                              |
| ------------ | -------------------------------------------------------- |
| `--name`     | Package slug (folder name + `@anvilkit/plugin-<slug>`)   |
| `--display`  | Human-readable plugin name                               |
| `--category` | `export`, `ai`, `rail-panel`, or `custom`                |
| `--dir`      | Target directory (default: cwd)                          |
| `--help`     | Show help                                                |

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

- Plugin authoring guide: https://github.com/ancyloce/anvilkit-studio/blob/main/apps/docs/src/content/docs/guides/plugin-authoring.mdx
- Phase 4 task: [`phase4-011`](https://github.com/ancyloce/anvilkit-studio/blob/main/docs/tasks/phase4-011-create-plugin-generator.md)
