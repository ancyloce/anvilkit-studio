# Marketplace governance policy

**Effective on:** the day `apps/docs/src/registry/feed.json` is first
deployed to `https://docs.anvilkit.dev/registry/feed.json` (tracked
by `phase6-013`).

This document is the public commitment AnvilKit makes to authors who
publish into the marketplace and to host apps who install from it.
It answers three questions:

1. What does it take to land an entry in the registry feed?
2. What does the `verified` badge promise — and what does it not?
3. How are entries reviewed, removed, and appealed?

A summary of the commitment:

- **Two-track verification.** Every `verified` entry must pass an
  automated scorecard **and** a manual maintainer review. Failing
  either is sufficient to block.
- **Submission via PR.** New entries land as PRs against
  `apps/docs/src/registry/feed.json`. There is no out-of-band
  submission queue.
- **48-hour SLA for first response.** A maintainer responds to every
  open submission PR within 48 hours.
- **Removable on cause.** Entries that fail re-verification, ship a
  CVE, or violate the trust model are removed within 5 business days.
- **Appealable on the record.** Every removal is reviewable through
  a PR opened by the original author with a remediation diff.

## 1. Submission flow

```text
                ┌──────────────────────────────────┐
   author       │ open PR mutating feed.json       │
   ───────────► │ (single entry, plus changeset)   │
                └────────────────┬─────────────────┘
                                 │
   GitHub Actions ──┐            ▼
                    │   marketplace-scorecard.yml runs (see §3)
                    │            │
                    └────────────┤
                                 ▼
   maintainer ────► reviews PR, manual checks (see §4)
                                 │
                                 ▼
                       ┌────────────────────┐
                       │ verified: true     │ ← merged on green
                       │ verified: false    │ ← merged with notes
                       │ rejected           │ ← closed, see §6
                       └────────────────────┘
```

Authors **must** include in the PR description:

- The package's published npm version that the entry pins to.
- A working install + usage snippet (`npx anvilkit add <slug>` is the
  default form, plus the resulting `puck-config.ts` diff).
- A statement that the package follows the trust model in
  [`docs/security/plugin-trust-model.md`](../security/plugin-trust-model.md).

## 2. Eligibility

To be eligible for `verified: true`, an entry MUST satisfy **all** of:

| # | Criterion                                                                                             |
| - | ----------------------------------------------------------------------------------------------------- |
| 1 | Source available under an OSI-approved license.                                                       |
| 2 | npm package is published to the public registry.                                                      |
| 3 | The package's `package.json` carries a `repository` field pointing at the source.                     |
| 4 | The package's CI runs `pnpm test` (or equivalent) and the latest run is green.                        |
| 5 | The package's README contains a runnable usage snippet for at least one host shape.                   |
| 6 | The package follows semver (no breaking changes inside a minor).                                      |
| 7 | The package does not perform network requests during `postinstall` or build.                          |
| 8 | The package's runtime peer-dep list overlaps the AnvilKit-supported peer ranges (see `lts.md` §6).    |

Entries that fail any of (1)–(8) MUST be submitted as
`publisher: "community"` with `verified: false`. They will still be
listed in `/marketplace`, but `anvilkit add` requires `--unsafe` to
install them.

## 3. Automated scorecard

The scorecard is implemented by
`.github/workflows/marketplace-scorecard.yml` (see `phase6-014`).
For each submitted entry it runs, in a clean staging directory:

| Check        | Pass criterion                                                       |
| ------------ | -------------------------------------------------------------------- |
| `license`    | License field present; matches an OSI-approved value (no GPL family) |
| `dependencies` | Direct deps don't include known-unsafe packages (allow-list maintained in the workflow) |
| `noNetwork`  | No `postinstall` / `prepare` script issues a network request         |
| `readme`     | README exists, ≥ 200 chars, contains a code fence                    |
| `build`      | `pnpm install --ignore-workspace && pnpm build` exits 0              |
| `test`       | `pnpm test` exits 0 (skipped only if the package declares no tests)  |
| `semver`     | The pinned `version` matches the `^semver$` regex                    |

The aggregate `passed: boolean` is `true` iff every applicable check
passes. The full per-check breakdown is written into
`apps/docs/src/registry/scorecards/<slug>.json` and surfaced in
`/marketplace` as the verified badge tooltip.

## 4. Manual review checklist

A maintainer performs all of:

| # | Check                                                                                                                |
| - | -------------------------------------------------------------------------------------------------------------------- |
| 1 | Slug + display name don't typosquat existing entries (case-insensitive substring + Levenshtein ≤ 3 against any slug). |
| 2 | The package's screenshots, copy, and metadata match the source repo — no fake claims about supported features.       |
| 3 | The package doesn't bundle proprietary assets without a license declaration.                                          |
| 4 | The package's PR carries a real reviewer (not the author).                                                            |
| 5 | The package's `installSpec.mutates` accurately describes the host files it touches.                                   |

Manual review is **necessary** for `verified: true`. Automated
scorecard alone is not sufficient — the typosquat / impersonation
check requires human judgment.

## 5. Re-verification

Verified entries are re-checked by the scorecard workflow on a
**weekly cron** (`.github/workflows/marketplace-scorecard.yml`'s
`schedule:` trigger). A re-verification pass that fails:

- Drops the entry's `verified` flag to `false` immediately and
  records the failure in the `scorecard` payload.
- Opens a tracking issue tagged `marketplace:re-verify`.
- Does **not** remove the entry from the feed; only `--unsafe`
  installs are blocked.

If two consecutive weekly re-verifications fail, the entry is
removed under §6.

## 6. Removal triggers

An entry is removed (its row deleted from `feed.json`) under any of:

| Trigger                                                                       | Window                       |
| ----------------------------------------------------------------------------- | ---------------------------- |
| Author requests removal                                                       | Immediate                    |
| Two consecutive weekly re-verifications fail                                  | At the second failure        |
| CVE filed against the published package, severity High or Critical            | 5 business days from disclosure |
| Trust-model violation (see [`docs/security/plugin-trust-model.md`](../security/plugin-trust-model.md)) | 5 business days from confirmation |
| License revocation by the upstream author                                     | Immediate on confirmation    |
| Maintainer agreement that the package is abandoned (no commits in 18 months)  | At the 18-month mark         |

Removal is recorded by a PR with the `marketplace:remove` label and
linked to the underlying trigger. Authors are notified through the
PR's `Reviewers:` field on their published repo, when reachable.

## 7. Appeals

The appeal path is a single track:

1. The original author opens a PR re-adding the entry to
   `feed.json` with a remediation diff explaining what changed.
2. The PR re-runs the scorecard. If green, a maintainer resumes the
   manual review under §4.
3. Re-verification follows the original SLA (48-hour first response).

Removed entries that pass re-verification are restored with a fresh
`addedAt` timestamp; their `slug` is preserved.

## 8. Slug ownership

Slugs are first-come, first-served and never reused. A removed
entry's slug is **retired** — a future submission cannot reuse it
even if the original author abandons the package. This prevents
replacement-attack vectors where a malicious replacement inherits
the trust state of a removed entry.

## 9. Maintainer SLA

| Event                                             | First response  | Resolution        |
| ------------------------------------------------- | --------------- | ----------------- |
| New submission PR                                 | 48 h            | 7 calendar days   |
| Re-verification failure                           | Best-effort     | 14 calendar days  |
| CVE / trust-model report (private)                | 24 h            | 5 business days   |
| Appeal PR                                         | 48 h            | 7 calendar days   |

SLA pauses on weekends and recognised public holidays in the
maintainer's primary timezone. The full holiday calendar lives in
`docs/policies/maintainer-rota.md` (TBD — sibling to this doc).

## 10. Cross-references

- [`docs/policies/marketplace-feed.md`](./marketplace-feed.md) — feed format, fields, versioning rules
- [`docs/policies/lts.md`](./lts.md) — LTS coverage for first-party entries
- [`docs/security/plugin-trust-model.md`](../security/plugin-trust-model.md) — trust boundaries the marketplace relies on
- `apps/docs/src/registry/feed.json` — canonical first-party feed
- `.github/workflows/marketplace-scorecard.yml` — automated scorecard implementation

This policy is itself versioned. Material changes (e.g. tightening
the eligibility list, narrowing the SLA) go through a public RFC and
a minimum 30-day comment period before they take effect.
