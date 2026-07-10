---
name: release-prep
description: >-
  Pre-release verification + go/no-go checklist for publishing @anvilkit packages.
  Detects the release surface (main workspace fixed-group vs components submodule),
  runs changeset status and the check:all release gates, enforces this repo's
  publish gotchas (version.ts drift, ui peer ranges, never-publish canvas-templates,
  bundle/api-snapshot), then hands the exact publish command to the user. Use when
  asked to "prep a release", "check release readiness", "/release-prep", or before
  cutting a version. Does NOT commit or publish.
disable-model-invocation: true
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Agent
---

# release-prep

Gets a release green and produces a **go/no-go** report with the exact publish command —
then stops. Publishing to npm is irreversible and outward-facing; the user runs the final
`changeset publish` / version bump themselves. Never `git commit`, push, or publish from
this skill.

## Step 1 — Identify the release surface

There are two independent surfaces; confirm which one (or both) is being released:

- **Main workspace** (`/`) — changesets `fixed` group bump together:
  `core, ir, schema, validator, utils, ui, plugin-ai-copilot, plugin-asset-manager,
  plugin-export-html, plugin-export-react, plugin-version-history`.
  Release path: `pnpm release` (= `changeset version && build && changeset publish`).
  `demo` is in `ignore`.
- **Components submodule** (`packages/extensions/components/`) — separate workspace + changeset config.
  Each `@anvilkit/<slug>` versions independently. **Changesets are often orphaned here** —
  if `changeset version` no-ops, bump the component `package.json` `version` directly to
  republish.

```bash
pnpm changeset:status                              # main workspace pending bumps
cd packages/extensions/components && pnpm exec changeset status   # components workspace
```

## Step 2 — Run the release gates

```bash
pnpm check:all                 # per-package release gates (api-snapshot, size, build, test)
pnpm publint                   # package.json exports validation
pnpm size                      # size-limit gzip budgets
```

If `check:all` fails, **do not hand-classify** — delegate to the triager agent, which knows
this repo's pre-existing-vs-regression patterns:

```
Agent(subagent_type: "release-gate-triager",
      prompt: "check:all failed during release-prep. Triage each failure as pre-existing
               vs regression and report a go/no-go per changed package.")
```

Only regressions block the release; the triager flags known-benign noise (phantom
concurrency oversubscription, stale api-snapshot paths after a reorg, known budget overflow).

## Step 3 — Enforce the publish gotchas (this repo's tripwires)

Check each before declaring go:

1. **`@anvilkit/canvas-templates` — NEVER publish it.** It has no `private: true` guard;
   publishing triggers a "missing package name" error. Explicitly exclude it from any
   `changeset publish` / release run.
2. **`CORE_VERSION` drift.** `packages/core/src/version.ts` must equal `core`'s
   `package.json` version, or `<Studio>` rejects plugins at runtime (mount-test timeouts).
   Verify they match after `changeset version`:
   ```bash
   grep -n "CORE_VERSION\|version" packages/core/src/version.ts
   ```
3. **`@anvilkit/ui` peer ranges.** Core pins `ui` exactly (`workspace:*`). Every publishable
   package's `ui` peer range must cover the version about to ship, or consumers hit ERESOLVE.
4. **Bundle budget on bump.** A version-string bump can push a package over its gzip budget
   (e.g. `plugin-export-react` ~409 B over). Fix order: trim `version.ts`, then bump the
   size-limit budget — don't bump the budget blindly.
5. **api-snapshot drift** is usually benign stale paths after a reorg (3 sites: exports map,
   typedoc `entryPoints`, the snapshot). The triager will confirm.

## Step 4 — Go/no-go report

Output:
- **Surface(s)**: main workspace / components / both
- **Pending bumps**: package → semver level (from changeset status)
- **Gate results**: pass, or regressions with file:line (pre-existing noise listed separately)
- **Gotcha checklist**: each of the 5 above marked ✓ / ✗
- **Verdict**: GO / NO-GO
- **Next command for the user to run** (do not run it yourself), e.g.:
  - main: `pnpm release`
  - components: `cd packages/extensions/components && pnpm release`  *(or the direct `package.json`
    version bump if changesets are orphaned)*

Stop here. The user executes the publish and all commits.
