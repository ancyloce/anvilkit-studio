# demo

Validation surface for the AnvilKit component, plugin, and template packages. Not a docs site — for that, see [`apps/docs`](../docs/) (`@anvilkit/docs-site`). The demo is the place where every published `@anvilkit/*` package gets exercised end-to-end through Puck before release.

## What it covers

- `/` — demo hub with links to the editor, renderer, and feature-specific test pages
- `/puck/editor` — interactive Puck editor wired through `<Studio>` from `@anvilkit/core`
- `/puck/render` — server-side render of the same payload via `@puckeditor/core/rsc`

Both routes share the Puck `Config` composed in [`lib/puck-demo.ts`](./lib/puck-demo.ts). When adding a new component to the demo, update that file and the `transpilePackages` array in [`next.config.js`](./next.config.js).

## Getting started

```bash
git submodule update --init --recursive   # one-time, from the repo root
pnpm install                               # one-time, from the repo root
pnpm --filter demo dev                     # Next.js dev server on :3000
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script               | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `pnpm dev`           | Next.js dev server on port 3000 (Webpack) |
| `pnpm dev:turbopack` | Same, but using Turbopack                 |
| `pnpm build`         | Production build (`next build`)           |
| `pnpm start`         | Serve the production build                |
| `pnpm lint`          | Biome lint                                |
| `pnpm typecheck`     | `next typegen` then `tsc --noEmit`        |
| `pnpm e2e`           | Playwright suite under [`e2e/`](./e2e/)   |
| `pnpm e2e:install`   | One-time Chromium install for Playwright  |

## Playwright suites

The `e2e/` directory exercises the surface area below. Run a single suite with `pnpm e2e <file>`.

- `smoke.spec.ts` — editor + renderer boot
- `button-input-smoke.spec.ts` — `@anvilkit/button` and `@anvilkit/input` smoke
- `section-ai.spec.ts` — section component AI flow
- `ai-copilot.spec.ts` — `@anvilkit/plugin-ai-copilot` end-to-end
- `asset-manager.spec.ts`, `asset-manager-puck-drag.spec.ts` — asset manager plugin
- `export-html.spec.ts`, `export-react.spec.ts` — exporter plugins
- `collab.spec.ts`, `presence.spec.ts` — collab plugins
- `sidebar-modules.spec.ts`, `a11y.spec.ts` — sidebar wiring + accessibility baseline

## Notes

- The demo depends on every workspace component package via `workspace:*`. After adding a new component package, list it in both `apps/demo/lib/puck-demo.ts` and `transpilePackages` in `apps/demo/next.config.js`.
- E2E tests must use unique room IDs and avoid port 1234 collisions — see the repo-level [`CLAUDE.md`](../../CLAUDE.md#test-infrastructure-notes).
- The canvas iframe does **not** inherit Tailwind utilities or parent-document CSS. Use inline styles or explicit `CopyHostStyles` injection when debugging styling that only renders inside the iframe.
