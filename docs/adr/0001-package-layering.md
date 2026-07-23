# ADR 0001: Package Layering

**Status:** Accepted
**Date:** 2026-07-09

## Context

The repository contains foundation libraries, a Puck-native runtime, optional analytics and Canvas systems, installable extensions, apps, and engineering tools, but their flat physical layout obscures responsibility. `@anvilkit/core` already depends on `@anvilkit/analytics-core`, proving that circular checks alone do not protect direction. The initial target also omitted the existing `@anvilkit/contracts` package, and `@anvilkit/utils` currently exports a React context helper.

## Decision

Adopt the dependency direction `apps -> extensions -> capabilities -> runtime -> foundation`, with repository tooling outside the product graph. Add `contracts` to target foundation. Move `utils` only after relocating its React-dependent export. Runtime may define optional-system interfaces but may not depend on concrete capabilities or extensions. Physical moves must preserve npm names, exports, versions, and repository metadata.

## Alternatives Considered

- Keep a flat `packages/*` layout and rely on naming conventions. Rejected because existing one-way violations are already easy to miss.
- Put every shared type in `@anvilkit/core`. Rejected because foundation packages would then depend upward on a React runtime.
- Treat analytics and Canvas as core features. Rejected because they are optional systems with independent packages and lifecycles.
- Move all directories in one change. Rejected because submodules, CI filters, TypeScript resolution, and release paths make the blast radius unacceptable.

## Consequences

- Package placement and dependency review have a durable rule.
- `@anvilkit/core -> @anvilkit/analytics-core` must be removed.
- `@anvilkit/utils` needs a React-free boundary before its physical move.
- `@anvilkit/contracts` becomes an explicit foundation package.
- A workspace boundary validator is required in addition to Madge.

## Follow-up Actions

- Add dependency-cruiser rules after establishing the audited baseline.
- Create the Studio/playground application split.
- Move packages by layer in dedicated PRs.
- Add regression tests for corrected dependency edges.
