# Marketplace registry feed

**Effective on:** the day `apps/docs/src/registry/feed.json` is first
deployed to `https://docs.anvilkit.dev/registry/feed.json` (tracked
by `phase6-011`).

This document is the public specification of the Anvilkit marketplace
registry feed. It answers three questions:

1. What does the feed look like, and how is it served?
2. Which fields are stable, and which evolve under what rules?
3. How do `anvilkit add` and the `/marketplace` catalog consume it?

A summary of the contract:

- **Versioned feed.** The top-level `feedVersion` field is bumped on
  any breaking shape change. Consumers MUST refuse a feed whose
  `feedVersion` they do not recognise.
- **Strictly additive within a major.** New optional fields are
  permitted; renamed or removed fields require a `feedVersion` bump.
- **Cached for 24 h.** Vercel serves the feed with a 24-hour TTL.
- **Validated at every CI run.** The feed is parsed against the Zod
  schema in `apps/docs/src/registry/feed.schema.ts`; CI rejects any
  malformed entry.

## 1. Hosting and delivery

| Path                                       | Source                                                        | Content                |
| ------------------------------------------ | ------------------------------------------------------------- | ---------------------- |
| `apps/docs/src/registry/feed.json`         | committed in this repo                                         | canonical first-party feed |
| `apps/docs/public/registry/feed.json`      | emitted by `pnpm --filter @anvilkit/docs-site generate:registry` | published asset        |
| `https://docs.anvilkit.dev/registry/feed.json` | docs site Vercel build                                        | runtime endpoint       |
| `https://docs.anvilkit.dev/registry/feed.schema.json` | docs site Vercel build                                        | JSON Schema (companion) |

The published `feed.json` and `feed.schema.json` are immutable for
the lifetime of any given commit; changes ship via a docs-site
deploy. Consumers SHOULD treat them as a stale-while-revalidate
resource.

## 2. Top-level shape

```jsonc
{
  "$schema": "/registry/feed.schema.json",
  "feedVersion": "1",
  "generatedAt": "2026-04-28T00:00:00.000Z",
  "entries": [ /* RegistryEntry[] */ ]
}
```

| Field          | Type                  | Notes                                                    |
| -------------- | --------------------- | -------------------------------------------------------- |
| `$schema`      | string (optional)     | Pointer to the published JSON Schema; tooling-only hint. |
| `feedVersion`  | `"1"`                 | Currently the only legal value. Bumps on breaking shape change. |
| `generatedAt`  | ISO-8601 datetime     | Stamped when the docs build emits the feed.             |
| `entries`      | `RegistryEntry[]`     | The full canonical list. `(kind, slug)` is unique.       |

## 3. `RegistryEntry`

```jsonc
{
  "slug": "landing-saas",
  "kind": "template",
  "name": "Landing page for a SaaS product",
  "description": "Landing page for a SaaS product — hero, logo cloud, bento features, pricing, FAQ.",
  "packageName": "@anvilkit/template-landing-saas",
  "version": "0.1.0-alpha.0",
  "category": "landing",
  "tags": [],
  "publisher": "first-party",
  "verified": true,
  "scorecard": { "passed": true, "ranAt": "…", "checks": { … } },
  "repository": "https://github.com/anvilkit/anvilkit-studio",
  "homepage": "https://anvilkit.dev/templates/landing-saas",
  "preview": "/templates/landing-saas/preview.png",
  "addedAt": "2026-04-28T00:00:00.000Z",
  "installSpec": {
    "mutates": ["lib/puck-config.ts", "next.config.js"],
    "scaffoldOnly": false,
    "peerInstalls": []
  }
}
```

### Field reference

| Field          | Type                                       | Required | Notes                                                                 |
| -------------- | ------------------------------------------ | -------- | --------------------------------------------------------------------- |
| `slug`         | `^[a-z0-9][a-z0-9-]{1,63}$`                | yes      | Stable opaque identifier within `kind`. NEVER reused.                |
| `kind`         | `"plugin" \| "template" \| "component"`    | yes      | Controls codemod and catalog rendering.                              |
| `name`         | string (≤ 120 chars)                       | yes      | Display name.                                                        |
| `description`  | string (≤ 512 chars)                       | yes      | One-line summary.                                                    |
| `packageName`  | string (≤ 214 chars)                       | yes      | Exact npm package name.                                              |
| `version`      | semver                                     | yes      | The version `anvilkit add` will install.                             |
| `category`     | string (≤ 64 chars)                        | yes      | Coarse filter bucket. Free-form but stable per kind.                 |
| `tags`         | string\[]                                  | yes      | Up to 16 tags; each ≤ 48 chars.                                      |
| `publisher`    | `"first-party" \| "verified" \| "community"` | yes      | Trust tier (see §5).                                                 |
| `verified`     | boolean                                    | yes      | Mirrors scorecard outcome (see §6).                                  |
| `scorecard`    | object                                     | no       | Latest CI scorecard payload (see `phase6-014`).                      |
| `repository`   | URL                                        | no       | Source repository.                                                   |
| `homepage`     | URL                                        | no       | Marketing site or docs page.                                         |
| `preview`      | absolute path                              | no       | Path under the docs site `/public/` directory; resolves at runtime.  |
| `addedAt`      | ISO-8601 datetime                          | yes      | Frozen on first appearance; preserved across regenerations.          |
| `installSpec`  | object                                     | yes      | Codemod hint for `anvilkit add` (see §7).                            |

## 4. `kind` semantics

| `kind`      | What `anvilkit add` does                                                                 |
| ----------- | ---------------------------------------------------------------------------------------- |
| `plugin`    | `pnpm add <packageName>` and register the plugin factory in `lib/puck-config.ts`.        |
| `template`  | `pnpm add <packageName>`, append the template's `PageIR` to the project's seed, and add the package to `next.config.js` `transpilePackages`. |
| `component` | `pnpm add <packageName>`, register the component config in `lib/puck-config.ts`, and add the package to `next.config.js` `transpilePackages`. |

`anvilkit add` performs no `kind`-specific behaviour beyond the table
above. Kinds are the contract — the install codemod treats them as
opaque labels into the matching transform.

## 5. `publisher` tiers

| Tier            | Meaning                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| `first-party`   | Authored by the Anvilkit core team. `verified: true`. Covered by LTS.    |
| `verified`      | Third-party, but passed automated scorecard + manual review.             |
| `community`     | Third-party, scorecard not yet passing or pending review. `verified: false`. |

`anvilkit add` resolves only to `first-party` and `verified` entries
by default. Consumers can opt into `community` with `--unsafe`.

## 6. `verified` and `scorecard`

`verified: true` REQUIRES one of:

- `publisher === "first-party"`, or
- `scorecard.passed === true` AND a manual approval recorded in the
  PR that added the entry (see
  [`marketplace-governance.md`](./marketplace-governance.md)).

The `scorecard` object is written by
`.github/workflows/marketplace-scorecard.yml` (see `phase6-014`):

| Field    | Type                  | Notes                                                  |
| -------- | --------------------- | ------------------------------------------------------ |
| `passed` | boolean               | Aggregate result. `false` ⇒ entry MUST set `verified: false`. |
| `ranAt`  | ISO-8601 datetime     | When the workflow last ran.                            |
| `commit` | git SHA (7-40 hex)    | The commit the scorecard ran against.                  |
| `checks` | `Record<string, boolean>` | Per-check breakdown (license, deps, build, test, README, semver). |
| `notes`  | string (≤ 512 chars)  | Reviewer notes, if any.                                |

## 7. `installSpec`

The CLI uses `installSpec` to know which files it will mutate, so
the dry-run preview is honest about its blast radius. The fields are:

| Field          | Type                | Notes                                                                        |
| -------------- | ------------------- | ---------------------------------------------------------------------------- |
| `mutates`      | string\[]           | Repository-relative paths the codemod will edit. Empty ⇒ install-only.       |
| `scaffoldOnly` | boolean             | When `true`, `anvilkit add` refuses to install — the entry is `init`-only.   |
| `peerInstalls` | string\[]           | Additional packages to `pnpm add` alongside the entry. Up to 8.              |

## 8. Versioning rules

`feedVersion` follows three rules:

1. **Add fields freely.** A new optional field is non-breaking and
   does not bump `feedVersion`.
2. **Removing or renaming bumps the major.** A breaking shape change
   forces `feedVersion` from `"1"` to `"2"`. Consumers refuse
   versions they do not recognise.
3. **Field semantics are stable within a major.** A field's meaning
   may not silently change. If semantics shift, deprecate the field,
   add a replacement, and bump on removal.

## 9. Update cadence

The first-party feed regenerates on every docs-site deploy via
`pnpm generate:registry`. New entries appear when the underlying
package metadata lands on the default branch — i.e. when the
component / template / plugin's `package.json` is added to the
workspace.

Third-party additions happen via PRs that edit
`apps/docs/src/registry/feed.json` directly. The
`marketplace-scorecard.yml` workflow runs on those PRs; failure
blocks merge.

## 10. Cross-references

- [`docs/policies/marketplace-governance.md`](./marketplace-governance.md) — submission, review, verification policy
- [`docs/policies/lts.md`](./lts.md) — LTS coverage for first-party entries
- [`docs/security/plugin-trust-model.md`](../security/plugin-trust-model.md) — registry-feed trust boundary
- `apps/docs/src/registry/feed.schema.ts` — canonical Zod source
- `apps/docs/scripts/generate-registry-feed.ts` — first-party generator
