# AnvilKit Studio `v1.0.0-beta` feedback

Thanks for running the beta. This channel collects feedback during the
`1.0.0-beta.x` window — before the `1.0.0` stable cut.

## What we're looking for

- **API friction.** Anything in `@anvilkit/core`, the plugin contract,
  or the export/AI plugins that felt surprising, awkward, or
  under-documented.
- **Upgrade pain.** Problems encountered while following
  [`docs/migration/0.x-to-1.0-beta.md`](../migration/0.x-to-1.0-beta.md).
- **Correctness bugs.** Anything that deviates from the behaviour
  documented in the guides on [docs.anvilkit.dev](https://docs.anvilkit.dev).
- **Performance regressions.** Anything measurably slower than
  `0.1.0-alpha.x`. Numbers from `pnpm bench` (phase4-015) are
  particularly welcome.

## How to file

1. **GitHub issues** — [`ancyloce/anvilkit-studio`](https://github.com/ancyloce/anvilkit-studio/issues/new).
   Tag with the `beta-feedback` label and, when it fits, one of:
   `area:core`, `area:plugin-export-html`, `area:plugin-ai-copilot`,
   `area:docs`, `area:migration`.
2. **Security findings** — follow `docs/security/plugin-trust-model.md`
   §8 (do **not** open a public issue).
3. **Doc issues** — PRs welcome. Every guide under
   `apps/docs/src/content/docs/guides/` is CI-tested.

## Response policy during beta

- **P0 / blockers** (install broken, release workflow wedged, security
  regression): triaged within one working day, patched as
  `1.0.0-beta.N+1`.
- **P1 / breaking-with-workaround**: triaged inside one week. Fix lands
  either in the next beta or documented as a known-issue.
- **P2 / polish**: batched into a single `1.0.0-beta.N` bump or rolled
  forward to `1.0.0` stable.

## Known-issues tracker

Open `beta-feedback` issues in the repo are the source of truth. A
curated "known issues" digest is published in the release notes for
each `1.0.0-beta.N` bump.

## See also

- [`docs/migration/0.x-to-1.0-beta.md`](../migration/0.x-to-1.0-beta.md)
  — upgrade guide from `0.1.0-alpha.x`.
- [`docs/announcements/2026-08-v1-beta.md`](../announcements/2026-08-v1-beta.md)
  — public announcement draft.
- [`triage-1.1-cutoff.md`](./triage-1.1-cutoff.md) — formal close of
  the `v1.1` queue (Phase 6 / `phase6-019`).
- Root [`CHANGELOG.md`](../../CHANGELOG.md) — aggregate release notes.
