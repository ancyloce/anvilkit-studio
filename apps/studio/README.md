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
pnpm --filter studio dev                     # Next.js dev server on :3000
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
- `analytics.spec.ts` — the analytics loop: chrome publish → `page_published`, save → `draft_saved`, published visit → `page_view`

## Analytics

The **primary** analytics feature is **published-page analytics** — traffic
statistics for pages *after they go live* (views, unique visitors, sessions,
referrers, views over time). Editor-side analytics is **secondary/optional** and
is used only for a publish audit + dev diagnostics.

```
published-page visit  ─▶  page_view  ─┐
editor event (optional, diagnostics)  ┼─▶  POST /api/analytics/events  ─▶  validate + enrich + persist
server-side publish success (audit)  ─┘                                          │
                                                                   GET /api/analytics/stats  ─▶  aggregate
```

### Published page analytics (primary)

- **Tracking.** Published pages fire exactly one `page_view` per visit
  (`source: "published_site"`):
  - `/puck/render?slug=…` mounts `<PublishedPageAnalytics>`
    (`components/PublishedPageAnalytics.tsx`).
  - the canonical `[...slug]` site fires it from `app/[...slug]/layout.tsx`.
  Each carries **primitive props only** — `page_id` / `slug` / `path` /
  `referrer` / `title` / `preview` plus an anonymous `visitor_id` + `session_id`.
- **Preview policy.** Preview/draft renders are **skipped entirely** (no event),
  and the stats endpoint also drops any `preview: true` event — so analytics
  reflect real published traffic only.
- **Anonymous identity.** `lib/analytics/visitor-session.ts` mints a persistent
  `visitor_id` (`anon_…`, `localStorage`) and a `session_id` (`sess_…`) that
  rolls over after **30 minutes** of inactivity. No auth, no cookies, no PII.
- **Ingestion** (`app/api/analytics/events/route.ts` → `lib/analytics/`) is the
  server trust boundary: it re-validates every event (allowed names, known
  sources, **primitive-only** properties, forbidden-field deny-list), rejects the
  whole batch on any violation, and attaches server-only enrichment — a coarse
  `user_agent` and a **salted IP hash** (`ip_hash`, never the raw IP). Response:
  `{ ok: true, accepted }` or `{ ok: false, message, issues? }`.
- **Storage** (`lib/analytics/store.ts`) is a replaceable seam: in-memory by
  default (deterministic for tests + the in-process loop), or append-only JSONL
  with `ANVILKIT_ANALYTICS_STORE=filesystem` (path `ANVILKIT_ANALYTICS_DIR`,
  default `.anvilkit/analytics/events.jsonl`). Swap it for a warehouse here.
- **Statistics** (`GET /api/analytics/stats`, aggregator in `lib/analytics/stats.ts`):
  `?slug=…` / `?pageId=…` / `?range=24h|7d|30d|90d|all` →
  `{ ok: true, data: { views, uniqueVisitors, sessions, topReferrers, viewsByDay, … } }`.
  A minimal read-only dashboard lives at **`/analytics`**.

### Publish audit + editor analytics (secondary)

- **Server-side publish audit.** A successful `POST /api/pages/publish` records a
  factual server-side `page_published` (`properties.server_side = true`, primitive
  slug + page id only). It marks *when a page went live* — it is **not** traffic
  analytics. A validation/storage failure records nothing.
- **Editor diagnostics.** The editor may pass an analytics adapter for system
  events (`draft_saved` / `component_dropped` / `seo_updated` / `plugin_toggled`);
  these are optional dev diagnostics, not the analytics product.

**What is collected** (published `page_view`): `page_id`, `slug`, `path`,
`referrer`, `title`, anonymous `visitor_id` + `session_id`, timestamp, and
server-derived `user_agent` + salted `ip_hash`.

**What is never collected/sent**: full Puck `Data`, page JSON, HTML, serialized
HTML, DOM nodes, `root` / `root.props`, component content/zones — and the **raw
IP address** (only a salted hash is stored). Properties are `string | number |
boolean` only; both the client adapter and the server endpoint enforce the
forbidden-field deny-list (`data`, `html`, `dom`, `root`, `rootProps`,
`puckData`, `serializedHtml`). Consent gates emission. See
`packages/capabilities/analytics/core/README.md` for the adapter contract.

## Canvas AI image provider

**The mock provider is the default, and CI never calls a paid API.** The Canvas
Studio AI panel runs through a deterministic offline mock unless
`NEXT_PUBLIC_AI_IMAGE_REAL=1` is set — `selectAiImageProvider` falls through to
`createMockAiImageProvider` (`lib/ai-image/provider-selection.ts:31`), so a bare
checkout, every test run, and every CI job cost nothing and reach no network.
Two separate variables gate the real provider on purpose: the secret
`REPLICATE_API_TOKEN` is read **server-side only**, in the route handlers
(`app/api/canvas/ai/_lib/replicate.ts:43` `readReplicateToken()`), while the
client decides which provider to build from the **public** flag
`NEXT_PUBLIC_AI_IMAGE_REAL` (`:21-23` `isRealAiImageEnabled()`) — so the secret
never has to be reachable from client code to answer "is the real provider
live?". Both ship unset (`.env.example:25,29`), no key exists anywhere in this
repository, and no workflow under `.github/` defines one. With the flag set but
no server token, every route answers `503 PROVIDER_DISABLED` and the client
turns that into a terminal, rendered error in the panel rather than a crash.
Three assertions keep this true rather than merely intended:
`pnpm --filter studio check:client-secret-leak` greps the **built** client
output for the token name and for key-shaped literals (wired into CI's
always-run `validate` job, after `pnpm build`);
`lib/ai-image/__tests__/provider-selection.test.ts` pins the default and the
degradation path; and `e2e/canvas-ai.spec.ts` asserts both the route's 503 and
that the browser issues zero requests to `/api/canvas/ai/*` or to any Replicate
host during a full AI run.

**Content safety is the embedding host's responsibility.** Replicate is a
model-hosting marketplace, not a moderation service, and this repository ships
**no** moderation layer of any kind: no prompt filtering, no output
classification, no per-user attribution, no audit log, no rate limit, and no
authentication on the AI routes. Whether `stability-ai/sdxl` applies a safety
checker to generated output is **unconfirmed** — the routes never set such an
input either way (`app/api/canvas/ai/text-to-image/route.ts` builds only
`{ prompt, negative_prompt?, width?, height?, seed? }`), so whatever the model's
own default is applies unchanged. Do not assume output is filtered. Per ADR 0009
Decision 4, the following are explicitly the embedding host's responsibility and
are not, and will not be, discharged by AnvilKit Canvas:

1. Prompt and output policy, including whatever classification or human review the host's jurisdiction and product require.
2. Per-user attribution and abuse response — the contract carries a `jobId` (`ai-contracts.ts:100`) but no user identity, by design.
3. Authentication and rate limiting on whatever endpoint fronts an `AiImageProvider`.
4. Retention, deletion, and disclosure obligations for generated assets.
5. Compliance with the upstream provider's acceptable-use policy — the host holds the account and the key, so the host holds the obligation.

See [`docs/adr/0009-canvas-ai-provider.md`](../../docs/adr/0009-canvas-ai-provider.md)
for the provider ratification, per-call cost model, and key-custody decision, and
[`.env.example`](./.env.example) for the operator warning about the
unauthenticated, unthrottled route surface.

## Notes

- The demo depends on every workspace component package via `workspace:*`. After adding a new component package, list it in both `apps/studio/lib/puck-demo.ts` and `transpilePackages` in `apps/studio/next.config.js`.
- E2E tests must use unique room IDs and avoid port 1234 collisions — see the repo-level [`CLAUDE.md`](../../CLAUDE.md#test-infrastructure-notes).
- The canvas iframe does **not** inherit Tailwind utilities or parent-document CSS. Use inline styles or explicit `CopyHostStyles` injection when debugging styling that only renders inside the iframe.
