# playground

Minimal integration and compatibility surface for the public `@anvilkit/*`
packages (see `docs/architecture/repository-structure.md` for the app-role
boundary). It exists to prove the published package surface works for an
external consumer: public entry-point imports only, no source aliases, no
`transpilePackages`, and no product features (persistence, collaboration
topology, dashboards, AI workflows, or navigation belong in `apps/studio`).

Routes:

- `/` — server-rendered index (zero client JS).
- `/editor` — mounts `<Studio>` from `@anvilkit/core` with the smallest
  viable Puck config (a single `@anvilkit/hero` component).
- `/render` — server-side `<Render>` from `@puckeditor/core/rsc` over the
  same config/data (SSR/RSC compatibility path).

Commands: `pnpm dev` (port 3100), `pnpm build`, `pnpm lint`,
`pnpm typecheck`.
