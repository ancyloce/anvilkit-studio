# @anvilkit/core

The Anvilkit Studio runtime. Provides the types, plugin engine, React
shell (`<Studio>`), and layered config system that host apps use to
embed a Puck-powered visual editor.

> **Under construction** — this package is an empty scaffold. Tracked
> in [`docs/plans/core-development-plan.md`](../../docs/plans/core-development-plan.md).
> See [`docs/tasks/`](../../docs/tasks/) for the per-milestone task
> breakdown (`core-004` … `core-016`).

The public API surface, build conventions, and plugin contract are all
documented in the plan. Until the alpha stabilizes in M6
(`core-015`), this package is versioned as `0.1.0-alpha.*` and its
exports are expected to churn without Changesets discipline.

## Subpath exports

Consumers can import either the full barrel or one of the narrow
subpaths:

| Import                                     | Filled in by   |
| ------------------------------------------ | -------------- |
| `@anvilkit/core`                           | root barrel    |
| `@anvilkit/core/types`                     | `core-005/006` |
| `@anvilkit/core/runtime`                   | `core-008/009` |
| `@anvilkit/core/config`                    | `core-007/011/012` |
| `@anvilkit/core/react`                     | `core-013/014` |
| `@anvilkit/core/compat`                    | `core-010`     |

The `./runtime` subpath is guaranteed to be React-free — a constraint
enforced in `core-015`'s quality gates so server-only and CLI tools can
depend on it without pulling React into their bundles.
