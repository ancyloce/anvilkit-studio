# @anvilkit/docs-site

The anvilkit-studio documentation site. Built with **[Fumadocs](https://fumadocs.dev/)**
on **[TanStack Start](https://tanstack.com/start)** (Vite + Nitro) — a server-rendered
app deployed to Vercel via the Nitro Build Output API.

> Migrated from Astro/Starlight. The content, the interactive Puck `/playground`,
> the marketplace catalog, and the registry/scorecard tooling all carried over;
> the runtime is now SSR rather than a static `dist/`.

## Commands

```bash
pnpm dev            # Vite dev server on :4321 (also boots the embedded collab relay)
pnpm build          # vite build → Nitro Build Output API at .vercel/output (preset: vercel)
pnpm typecheck      # fumadocs-mdx && tsc --noEmit
pnpm test           # vitest — registry-feed + scorecard + guide code-block tests
pnpm e2e            # Playwright — playground + marketplace specs
pnpm generate:all   # regenerate component/API/template pages + registry/feed.json
```

## Content

MDX lives under `content/docs/**`. Hand-authored prose is internationalized in
**en / zh / ja / ko** via locale-suffixed siblings (`foo.zh.mdx`, …); English is
the default locale and is served without a path prefix (Starlight URL parity).

Three trees are **generated and committed** (no build-time generation hook):

| Tree                        | Generator                                   |
| --------------------------- | ------------------------------------------- |
| `content/docs/components/`  | `scripts/generate-component-pages.ts`       |
| `content/docs/api/`         | `scripts/generate-api-pages.ts` (TypeDoc)   |
| `content/docs/templates/`   | `scripts/generate-template-pages.mjs`       |
| `src/registry/feed.json` + `public/registry/` | `scripts/generate-registry-feed.mjs` |

Run `pnpm generate:all` after changing a component, plugin, or template to refresh
them. The auto-generated API reference (`content/docs/api/**`) is English-only and
reached for other locales via Fumadocs `fallbackLanguage`.

## Deployment

Vercel **Root Directory** must be `apps/docs`. Vercel reads `apps/docs/vercel.json`,
runs the build from the repo root, and consumes the Build Output API that Nitro
emits to `apps/docs/.vercel/output`. There is no root `vercel.json`.
