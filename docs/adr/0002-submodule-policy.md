# ADR 0002: Submodule Policy

**Status:** Accepted
**Date:** 2026-07-09

## Context

`.gitmodules` currently defines 17 submodules: the component workspace, 12 plugins, two Canvas packages, and two analytics packages. Root CI recursively checks them out and separately installs the nested components workspace. Documentation has drifted between three, fourteen, and seventeen submodules, and repository instructions required every new module to become a submodule regardless of ownership or lifecycle.

## Decision

The monorepo is the default for packages sharing maintainers, baselines, cross-package changes, access, CI, and release coordination. An independent repository or submodule requires evidenced independent ownership, lifecycle, permissions, or operational value. `.gitmodules` is the canonical inventory. Every retained submodule must publish an ownership, toolchain, script, CI, peer-range, Changesets, and release contract.

## Alternatives Considered

- Make every package a submodule. Rejected because it multiplies coordinated PRs, lockfiles, CI setup, gitlink drift, and clean-clone failures.
- Eliminate every submodule immediately. Rejected because ownership evidence is incomplete and broad gitlink moves are high risk.
- Keep the current set permanently. Rejected because several packages are tightly coupled to the runtime and receive no demonstrated operational benefit from separation.

## Consequences

- New packages no longer become submodules automatically.
- Current submodules remain in place during Phase 0.
- Future consolidation decisions require owner and release evidence, not package type alone.
- Counts are never copied into durable guidance; they are derived from `.gitmodules` when needed.

## Follow-up Actions

- Record owners and release owners; use `unknown` until evidence exists.
- Add retained-submodule contract validation and recursive clean-clone CI.
- Review each existing submodule for retain-versus-merge after the layer migration.
- Move gitlinks only in dedicated, reversible PRs.
