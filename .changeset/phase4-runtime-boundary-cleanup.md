---
"@anvilkit/core": minor
"@anvilkit/utils": minor
---

Dependency-boundary cleanup (restructure plan 0001, Phase 4): the runtime
layer no longer depends on the analytics capability, and the
`@anvilkit/utils` main entry is now React-free.

**`@anvilkit/core` — runtime-owned analytics port:**

- `@anvilkit/analytics-core` is no longer a production dependency of
  `@anvilkit/core` (it remains a devDependency for boundary-compat tests).
- New exported types `StudioAnalyticsPort` (the minimal `track`-only
  surface `<Studio analytics>` consumes) and `StudioAnalyticsEventName`
  (the five Studio-owned system event names) from both `@anvilkit/core`
  and `@anvilkit/core/react`.
- `StudioProps.analytics` is now typed as `StudioAnalyticsPort`. Every
  `@anvilkit/analytics-core` adapter satisfies the port structurally, so
  existing hosts compile and behave unchanged.

**`@anvilkit/utils` — React helper off the main entry:**

- `getStrictContext` is no longer re-exported from the `@anvilkit/utils`
  main entry. Import it from the (already-published) subpath instead:
  `import { getStrictContext } from "@anvilkit/utils/get-strict-context"`.
- The main entry no longer statically imports `react`, so plain-Node
  consumers of `debounce` / `deepMerge` / `generateId` / `invariant` no
  longer need the optional `react` peer installed.
