# `src/shared/` — first-party cross-cutting helpers

The single home for **first-party** utilities used across more than one
top-level domain (`config/`, `studio/`, `react/`, `state/`). Reached via the
`@/shared/*` alias. Low in the layer graph — files here must not import from
`studio/`, `react/`, or `state/`.

(Next.js `shared/lib/` pattern.)

## What lives here

- `cn.ts` — the `clsx` + `tailwind-merge` class-name merger. The most
  widely-imported symbol in the package (~50 importers); it was previously
  filed under `react/overrides/utils/`, which mislabeled a package-wide
  primitive as an overrides concern.

## What does NOT live here

- **Feature-local utilities** stay with their feature (e.g.
  `react/overrides/utils/` keeps `breadcrumbs`, `format-timestamp`,
  `puck-selector`, `action-bar-position`, `use-reactive-puck`).
- **Vendored (shadcn/animate-ui) support** lives under
  `studio/primitives/vendor/` (e.g. `get-strict-context`, the animate-ui
  hooks) — not here. `src/shared/` is first-party only.
- The cross-package `getStrictContext` strict-context helper is
  `@anvilkit/utils`, an external workspace package — not duplicated here.
