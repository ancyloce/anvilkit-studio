# @anvilkit/collab

Production [Hocuspocus](https://hocuspocus.dev) WebSocket relay for the
AnvilKit docs playground (`/playground/?collab=1`).

The docs site deploys **static** (Vercel, no SSR adapter) and therefore
**cannot host a WebSocket** — Vercel's serverless/edge runtime has no
long-lived connections. Real multi-user collaboration needs this
always-on relay running on a WS-capable host. We deploy it to
[Fly.io](https://fly.io); the static docs site connects out to it over
`wss://` via the `PUBLIC_COLLAB_WS_URL` build env.

This is a **standalone, Dockerized service** — it lives under `apps/` but
is deliberately _excluded_ from the pnpm workspace (see the `!apps/collab`
entry in `pnpm-workspace.yaml`), so it builds and deploys independently of
the monorepo with its own npm lockfile (no Turbo/CI gates). It reuses the
same
`@hocuspocus/server@4.1.0` protocol the playground client
(`@hocuspocus/provider@4.1.0`) speaks, so there's no client rewrite.

> For the local dev/preview experience, `apps/docs` auto-starts an
> _ephemeral_ in-process relay (`apps/docs/integrations/collab-relay.mjs`,
> port 41234). This service is the durable, deployable counterpart.

## Modes

| `REDIS_URL` | Mode | Behavior |
| --- | --- | --- |
| set | **durable** | Docs persist to Redis (survive restarts) **and** updates fan out across multiple relay instances (horizontal scale). |
| unset | **ephemeral** | In-memory, single instance, rooms reset on restart. Good for a local smoke test. |

## Access control

- `COLLAB_ALLOWED_ORIGINS` — comma-separated origin allowlist; WS
  upgrades from other origins are rejected. Empty = allow any (logged at
  boot).
- `COLLAB_AUTH_TOKEN` — when set, clients must present this exact token
  (the playground sends it via `PUBLIC_COLLAB_WS_TOKEN`). Unset = open
  relay, fine for a public demo playground.

See [`.env.example`](./.env.example) for the full env surface.

## Local run

```bash
cd apps/collab
npm install
node server.mjs                      # ephemeral (no REDIS_URL)
# or, durable against a local/remote Redis:
REDIS_URL=rediss://default:pwd@host.upstash.io:6379 node server.mjs
```

`GET /` returns `200` (used as the health check).

## Deploy to Fly.io

**1. Create a Redis (Upstash works on Fly's free tier):**

```bash
fly redis create            # → gives you a rediss:// connection string
# or use Upstash directly: https://upstash.com → create a Redis DB → copy the rediss:// URL
```

**2. Launch the app (first time) — uses the bundled `fly.toml`:**

```bash
cd apps/collab
fly launch --no-deploy --copy-config --name anvilkit-collab
```

**3. Set secrets (NOT committed):**

```bash
fly secrets set REDIS_URL='rediss://default:<pwd>@<host>.upstash.io:6379'
# optional, to gate access:
# fly secrets set COLLAB_AUTH_TOKEN='<a-long-random-string>'
```

Adjust `COLLAB_ALLOWED_ORIGINS` in `fly.toml` to your docs origin(s),
then:

**4. Deploy:**

```bash
fly deploy
# note the app URL, e.g. https://anvilkit-collab.fly.dev
```

Verify: `curl https://anvilkit-collab.fly.dev/` → `200`.

## Wire the docs site

Set a **build-time** env var on the docs deployment (Vercel → Project →
Settings → Environment Variables) so the static client knows where to
connect:

```
PUBLIC_COLLAB_WS_URL = wss://anvilkit-collab.fly.dev
# only if you set COLLAB_AUTH_TOKEN on the relay:
# PUBLIC_COLLAB_WS_TOKEN = <same token>
```

Redeploy the docs site. Now `https://anvilkit.dev/playground/?collab=1`
connects to the Fly relay for real multi-user collaboration. Without
`PUBLIC_COLLAB_WS_URL`, the playground falls back to the in-memory
single-tab session (and locally, to the auto-started dev relay).

## Operational notes

- **Persistence** is current-state snapshots keyed `anvilkit:collab:doc:<room>`
  in Redis — no compaction needed (Hocuspocus stores state, not the
  update stream). Back up Redis like any datastore.
- **Scale to zero**: `fly.toml` sets `min_machines_running = 0` (cheap;
  cold start on first connect). Raise to `1` for an always-warm relay.
- **Abuse**: an open relay (no `COLLAB_AUTH_TOKEN`) lets anyone on an
  allowed origin create/join rooms. For a public playground, keep the
  origin allowlist tight and consider a token if cost/abuse becomes a
  concern. There is no built-in rate limiting.
- **Alternatives**: the same client works against any Hocuspocus host
  (Railway/Render/your own Docker host) — only `PUBLIC_COLLAB_WS_URL`
  changes. See `packages/plugins/plugin-collab-yjs/docs/hocuspocus-deployment.md`
  for the Postgres-backed variant.
