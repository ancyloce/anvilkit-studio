# Long-Term Support (LTS) policy

**Effective on:** the day `@anvilkit/core@1.0.0` lands on the
`latest` npm dist-tag (tracked by `phase5-020`).
**Re-effective for `1.1.x`:** the day `@anvilkit/core@1.1.0` lands
on the `latest` npm dist-tag (tracked by `phase6-021`). The
`1.0.x` window continues for an additional six months past
`v1.1.0` ship per [§ 1](#1-support-window).

This document is the public commitment Anvilkit makes to host apps
building on the `@anvilkit/*` packages in the `fixed` Changesets
group. It answers three questions:

1. How long is `v1.0.0` supported?
2. Which surface is covered by that support?
3. What rules govern additive changes, deprecations, and removals?

A summary of the commitment:

- **12 months of patch support** for the current `v1.x` minor
  from its ship date (`v1.1.x` from `v1.1.0`); `v1.0.x` continues
  for 6 months past `v1.1.0` as an overlap window.
- **Semver-strict** rules for every covered export.
- **Minimum 6-month (≈2 minor) deprecation window** before any
  removal.
- **Node 20 LTS + Node 22 LTS** for the life of `v1.x`.
- **Puck `^0.21 || ^0.22`** as the supported peer range.

## 1. Support window

| Channel               | Support                                  | Window                                |
| --------------------- | ---------------------------------------- | ------------------------------------- |
| `v1.1.x` (patches)    | Security + regression fixes              | 12 months from `v1.1.0`               |
| `v1.0.x` (overlap)    | Security + regression fixes only         | 6 months past `v1.1.0` ship           |
| `v1.0.x` (patches)    | Security + regression fixes              | 12 months from `v1.0.0` (concludes during the overlap window) |
| `v1.x` (minors)       | New features, non-breaking additions     | Through the next major                |
| `v0.1.0-alpha.x`      | Deprecated on `v1.0.0` GA                | No further releases                   |
| `v1.0.0-beta.x`       | Superseded by `v1.0.0` stable            | 30-day grace-period fixes             |

"Security fix" means a CVE-eligible issue on a supported surface.
"Regression fix" means an unintended behavior change in a supported
surface introduced by an earlier minor.

`v2.x` will not ship before the 12-month window on the latest
`v1.x` minor closes (currently `v1.1.x`). When it does, `v1.x`
moves to the `legacy` dist-tag and receives security fixes only.

## 2. Covered surface

The LTS commitment covers every export listed in the `exports` field
of each `fixed`-group `package.json`. Concretely:

### `@anvilkit/core`

- `.` (root barrel)
- `./types`, `./runtime`, `./config`, `./react`, `./compat`,
  `./testing`, `./templates`

### `@anvilkit/ir`

- `.` (root barrel)
- `./<wildcard>` subpaths reachable through the `./*` conditional
  entry (per-module direct imports)

### `@anvilkit/schema`, `@anvilkit/validator`, `@anvilkit/utils`

- `.` (root barrel only)

### Plugins (`@anvilkit/plugin-ai-copilot`, `@anvilkit/plugin-export-html`, `@anvilkit/plugin-export-react`, `@anvilkit/plugin-asset-manager`, `@anvilkit/plugin-version-history`)

- `.` (the default Studio plugin export)

### CLI (`anvilkit`, `create-anvilkit-plugin`)

- The invocable binary name AND the flag surface listed in each
  CLI's `--help` output at ship.

### Templates (`@anvilkit/template-<slug>` for the 10 seed slugs)

- `.` (the default `AnvilkitTemplate` export)
- `./page-ir.json` (raw IR for tooling)
- `./preview.png` (static preview asset)

### Components (`@anvilkit/<component-slug>`)

Components are versioned OUTSIDE the fixed group. Each component
follows the same semver rules but carries its own release train and
support window, documented per-package.

## 3. Semver rules

| Change kind                                                          | Version bump |
| -------------------------------------------------------------------- | ------------ |
| Adding a new export to any covered barrel                            | Minor        |
| Removing an export, or narrowing a covered type                      | Major        |
| Widening an input type on a covered function                         | Minor        |
| Narrowing a covered function's return type                           | Major        |
| Bug-fix that brings runtime behavior in line with documented intent  | Patch        |
| Behavior change that alters the observable contract of a covered export | Major        |
| Adding a new subpath (`./foo`)                                       | Minor        |
| Removing a subpath                                                   | Major        |
| Adding a new peer-dep range                                          | Minor        |
| Narrowing a peer-dep range                                           | Major        |
| Widening a peer-dep range                                            | Minor        |

Validator gate: every PR that modifies `packages/core/api/api-snapshot.json`
with a non-additive diff requires a major-bump justification in the
changeset body. Reviewers reject PRs where the bump doesn't match
the snapshot delta.

## 4. Behavioral fixes since `1.0.0-beta`

Two `validateAiOutput` / `validateComponentConfig` defects were closed
between `1.0.0-beta.0` and the `1.0.0` GA cut (`phase5-019`). Both
are additive — issue codes are stable, no public type narrowed — but
they change which inputs the validators reject:

- **F-2 — `[INVALID_CHILDREN]` (nested).** A non-array `children`
  value buried at any depth is now rejected with the full structural
  path (e.g. `root.children.0.children`), not just at the root. The
  AI pipeline used to accept these silently and crash downstream at
  `irToPuckPatch` with `.map is not a function`.
- **F-3 — `[NON_SERIALIZABLE_PROP]` and `E_NON_SERIALIZABLE_DEFAULT`
  (nested).** The serialisation walk in both `validateAiOutput` and
  `validateComponentConfig` recurses into nested objects and arrays;
  a function buried at `defaultProps.settings.layout.onPress` reports
  the full path, not the truncated top-level key. Failure reasons
  (`function`, `symbol`, `bigint`, `circular`, `exceeds-max-depth`)
  are included in the message.

If a host app was already feeding valid IR / configs to the
validators, nothing changes. If it was feeding malformed input,
errors that previously surfaced at runtime now surface at validation
time. See [`docs/migration/1.0-beta-to-1.0.md`](../migration/1.0-beta-to-1.0.md)
§ "Behavioral fixes" for the full diff.

## 5. Deprecation policy

- Deprecations MUST ship with a `@deprecated` TSDoc marker,
  pointing at the replacement API.
- Deprecations MUST ship in a minor release and cite the removal
  target minor.
- Minimum **2 minors (~6 months)** between the deprecation release
  and the removal release. Concretely: a deprecation landed in
  `v1.3.0` cannot be removed before `v1.5.0`.
- A deprecation that introduces a runtime warning MUST be opt-in at
  first (via env flag or explicit import) and become default in the
  next minor.
- Removal triggers a major bump, NOT a minor.

## 6. Node + peer version support

| Dep               | Supported range     | Notes                                                   |
| ----------------- | ------------------- | ------------------------------------------------------- |
| Node              | 20 LTS, 22 LTS      | CI runs on both. `engines.node` is `>=20.0.0`.          |
| React             | 18.x, 19.x          | React 20 support evaluated when React RC lands.         |
| React DOM         | 18.x, 19.x          | Matches React.                                          |
| `@puckeditor/core`| `^0.21 \|\| ^0.22`  | Widened by minor if Puck ships a non-breaking 0.23.     |
| TypeScript        | 5.4+ for consumers  | The repo pins 6.0.2 for its own sources.                |

Support windows may widen on minor releases; they do not narrow
within the life of `v1.x`.

## 7. Security

- CVE-class issues on a supported surface get a patch release within
  5 business days of a reproducible report.
- The `docs/security/plugin-trust-model.md` document (phase4-014)
  remains the canonical reference for plugin trust, XSS handling,
  and asset-resolver sandboxing.
- Report security issues privately first — see the repo's
  `SECURITY.md`.

## 7.1 Alpha-channel packages

Some packages ship on the `alpha` npm dist-tag and are explicitly
**outside the LTS commitment** until they graduate to `latest`. The
current alpha-channel packages are:

| Package                             | Status               | Graduation target        |
| ----------------------------------- | -------------------- | ------------------------ |
| `@anvilkit/plugin-collab-yjs`       | alpha (M12 — `phase6-018`) | `v1.2.0` (TBD, post-1.1) |

Alpha-channel packages are subject to the following caveats — none
of which apply to the rest of the fixed group:

- **No semver-strict commitment.** Breaking changes can land in any
  release; hosts should pin exact versions.
- **No 12-month patch window.** Security and regression fixes are
  best-effort during the alpha cycle; once a package graduates the
  full LTS clock starts at the GA release.
- **No `@latest` install.** `pnpm add @anvilkit/plugin-collab-yjs`
  resolves the alpha tag; `npm install @anvilkit/plugin-collab-yjs@latest`
  will fail until graduation.
- **Documented limitations.** Each alpha package ships a "known
  alpha-only edge cases" section in its own doc. For
  `plugin-collab-yjs`, see
  [`docs/architecture/realtime-collab.md`](../architecture/realtime-collab.md) § 6.
- **Trust-boundary disclosure.** Alpha plugins that introduce a new
  trust boundary (e.g. `subscribe()` callbacks delivering remote
  IR) appear in
  [`docs/security/plugin-trust-model.md`](../security/plugin-trust-model.md)
  before they ship.

A package graduates to LTS once: (1) the surface is stable across
two consecutive minors, (2) the trust-boundary section moves from
"alpha caveat" to "supported", and (3) a `latest` dist-tag publish
is recorded.

## 8. End of support

When `v1.x` reaches end of support:

- The `latest` npm dist-tag moves to the current `v2.x` line.
- `v1.x` moves to the `legacy` dist-tag.
- `v1.x` receives security-only patches for an additional 6 months.
- After that, `v1.x` is unsupported; host apps are expected to be
  on `v2.x`.

This policy is itself versioned. Material changes (e.g. shortening
the support window) go through a public RFC and a minimum 30-day
comment period before they take effect.
