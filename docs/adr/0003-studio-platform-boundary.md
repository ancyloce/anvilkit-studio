# ADR 0003: Studio and Platform Boundary

**Status:** Accepted
**Date:** 2026-07-09

## Context

`apps/collab` is excluded from the pnpm workspace and carries its own lockfile, Node runtime, Hocuspocus server, Redis dependency, Docker image, Fly configuration, persistence, origin policy, and deployment lifecycle. Root Compose, Caddy, GHCR workflows, the demo, and docs playground currently coordinate it. Existing platform requirements define `anvilkit-platform` as a separate backend repository.

## Decision

Production ownership of the relay moves to `anvilkit-platform/services/collab-relay` in Phase 2. This repository retains frontend client contracts and local-only integration infrastructure under `infra/local`. Phase 0 does not move or delete the service. Extraction proceeds contract-first with parallel deployment and a rollback window.

## Alternatives Considered

- Keep the relay under `apps/`. Rejected because its operational and scaling lifecycle is backend service ownership.
- Move the service immediately. Rejected because image, environment, WebSocket, Redis, proxy, Fly, and rollback contracts are not yet established in the platform repository.
- Remove local relay support from Studio. Rejected because integration and compatibility testing require a reproducible local service.

## Consequences

- Platform owns the production image, deployment, persistence, scaling, secrets, and observability after extraction.
- Studio owns client compatibility and local fixtures.
- `docker-compose.yml`, `Caddyfile`, `.github/workflows/docker-images.yml`, environment variables, GHCR naming, and documentation require coordinated updates.
- Both deployments must coexist until production validation completes.

## Follow-up Actions

- Define the WebSocket path/protocol, health, origin, Redis, image, and environment contracts.
- Establish platform owners, secrets, observability, and rollback.
- Deploy the platform relay without switching clients.
- Migrate traffic, observe, then remove production ownership from Studio.
