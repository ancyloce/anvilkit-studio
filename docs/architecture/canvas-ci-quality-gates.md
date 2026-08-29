# Canvas CI quality gates

PLAN-0039 E0 separates Canvas verification by failure class. This keeps merge
requirements fast and diagnosable while preserving dedicated environments for
browser, performance, accessibility, and stress evidence.

| CI check | Trigger | Suite | Merge role |
| --- | --- | --- | --- |
| `Canvas required — unit, type, migrations` | Canvas changes and manual/nightly runs | Canvas Core and Editor typechecks, coverage tests, and explicitly named migration suites | Required |
| `Canvas required — real-browser smoke` | Studio or package-cone changes and manual/nightly runs | Bounded Chromium mount, stage, and scene-readout smoke on the real Canvas route | Required |
| `Canvas layout resolver benchmark (PRD §13.1)` | Canvas changes and manual/nightly runs | Versioned Canvas Core reference fixture benchmark | Performance evidence |
| `Editor performance budgets (§28)` | Package-cone changes and manual/nightly runs | Dedicated-runner editor performance budgets | Performance evidence |
| `Canvas accessibility — WCAG browser checks` | Studio or package-cone changes and manual/nightly runs | Chromium plus axe over the Canvas shell, export dialog, and context menu | Accessibility gate |
| `Canvas stress — scale and convergence` | Nightly and manual runs | Resource ceilings, property round trips, 1,000/5,000-node throughput, and collaboration convergence | Stress gate |

The two `Canvas required` check names are the branch-protection contract. A
unit, type, migration, or real-browser smoke failure exits non-zero and must not
be marked optional or `continue-on-error`. Repository CI defines those checks;
the GitHub branch rule must require both names before merge.

Package scripts own the migration and stress file lists. Adding a migration or
stress fixture requires updating the corresponding `test:migrations` or
`test:stress` script so the suite remains explicit and reviewable.
