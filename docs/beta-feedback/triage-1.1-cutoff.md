# `v1.1.0` beta-feedback cutoff triage

**Cutoff date:** 2026-04-28 (operational equivalent of nominal `2027-10-01`
per `docs/plans/phase-6-plan.md` § 4 M13 / § 7 risk 7).
**Source phase:** Phase 6, Workstream N — `phase6-019`.
**Sign-off:** Principal Architect.
**Companion docs:** [`docs/migration/1.0-to-1.1.md`](../migration/1.0-to-1.1.md) ·
[`docs/policies/lts.md`](../policies/lts.md) §§ 1, 7.1 ·
`docs/archive/announcements/2027-12-v1-1-ga.md` (draft, not retained in
the tracked tree).

This document records the formal close of the `v1.1` beta-feedback
queue and lists everything triaged forward to `v1.2`. It satisfies
the `phase6-019` definition of done:

> Zero P0 / P1 1.1-tagged items open; triage-cutoff doc lists
> deferred items.

## 1. Queue snapshot at cutoff

| Severity | Open at cutoff | Closed in 1.1 | Deferred to 1.2 |
| -------- | -------------- | ------------- | --------------- |
| P0       | 0              | 0             | 0               |
| P1       | 0              | 0             | 0               |
| P2       | 0              | 0             | 0               |

No `beta-feedback`-labelled GitHub issues were filed against the
`1.0.0-beta` cycle. The Phase 5 → Phase 6 pull-forward (project
roadmap § 14) collapsed the nominal nine-month beta soak window
into the same operational quarter as the GA cut, so the public
beta cohort that the original `phase-6-plan.md` § 7 risk 7
mitigation assumed never materialised. The `1.0.0-beta` →
`1.0.0` exit (`docs/migration/1.0-beta-to-1.0.md`) shipped without
external feedback churn; nothing carried into the `1.1` queue.

## 2. Items deferred to 1.2

**None.** No P0, P1, or P2 items were re-triaged forward.

## 3. Items closed inside 1.1

**None routed through this queue.** The five Phase 6 workstreams
(J/K/L/M/N) drove every additive surface that ships in `1.1.0`;
each landed against its own `phase6-NNN` task rather than against
beta-feedback. See `docs/migration/1.0-to-1.1.md` for the full
additive diff.

## 4. What this means for `1.2`

The `1.2` cycle starts the next minor against a real GitHub-issues
queue. From `v1.1.0` GA onward:

- `beta-feedback` label is retired in favour of `1.2-candidate` /
  `1.2-blocker` triage labels.
- The 12-month `1.0.x` LTS overlap window (per
  [`docs/policies/lts.md`](../policies/lts.md) § 1) absorbs any
  late-arriving `1.0`-era reports as patch fixes, not as `1.1`
  blockers retroactively.
- `plugin-collab-yjs` alpha feedback is **not** routed here — it
  has its own alpha-only feedback path documented in
  [`docs/architecture/realtime-collab.md`](../architecture/realtime-collab.md)
  § 6.

## 5. References

- `docs/plans/phase-6-plan.md` § 4 M13, § 7 risk 7, § 10 acceptance
  criteria.
- `docs/tasks/phase-6-tasks.md` — `phase6-019` task definition.
- `docs/beta-feedback/README.md` — original beta channel scope.
- `docs/migration/1.0-beta-to-1.0.md` § 6 — pre-cutoff
  carry-forward inventory.
