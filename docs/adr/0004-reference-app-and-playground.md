# ADR 0004: Reference App and Playground

**Status:** Accepted
**Date:** 2026-07-09

## Context

`apps/demo` is documented as a small validation surface, but its manifest and source include analytics, Canvas, AI, asset management, collaboration, SQLite/Drizzle persistence, publishing, product routes, and extensive Playwright coverage. Package compatibility checks and the full product therefore share one large application. `apps/docs` also hosts a playground, increasing responsibility overlap.

## Decision

Rename `apps/demo` to `apps/studio` in Phase 1 and treat it as the complete product-grade reference implementation. Add `apps/playground` as the minimal public-package integration and compatibility app. Keep `apps/docs` focused on Fumadocs content, API references, marketplace, and lightweight examples.

## Alternatives Considered

- Keep calling the full product `demo`. Rejected because the name understates its responsibilities and encourages compatibility tests to accumulate product dependencies.
- Use the docs playground for all compatibility testing. Rejected because docs framework concerns would contaminate minimal SSR/RSC/peer validation.
- Strip product behavior from `apps/demo` first. Rejected because a rename followed by deliberate test extraction is safer and preserves deployment continuity.

## Consequences

- Studio may intentionally contain product navigation, persistence, collaboration, dashboards, publishing, AI, and Canvas integration.
- Playground stays small and disposable enough for reproduction cases.
- CI separates product E2E, docs E2E, and package compatibility coverage.
- Rename work must update package filters, workflows, Docker images, Compose, Caddy, scripts, docs, and deployment settings without changing package APIs.

## Follow-up Actions

- Rename the directory and private workspace name in a dedicated PR.
- Add the minimal playground and migrate smoke/compatibility tests incrementally.
- Keep product workflows in Studio and lightweight examples in docs.
- Add SSR, RSC, public-export, and peer-dependency acceptance tests to playground.
