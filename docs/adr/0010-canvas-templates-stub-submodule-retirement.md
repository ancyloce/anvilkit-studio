# ADR 0010: Retire the stub `canvas/templates` submodule

**Status:** Accepted — approved by the owner (ancyloce) on 2026-08-07. The removal itself is `cp3-008`'s work and has **not** been executed by this ADR.
**Date:** 2026-08-07
**Resolves:** PLAN-0035 `cp0-006` (§5 P0, §6, §9 R-9)
**Gates:** PLAN-0035 `cp3-008` (the task that performs the removal)
**Constrains:** `.gitmodules`, `.git/config`, `scripts/submodule-contract.json`, `docs/architecture/repository-structure.md`
**Sign-off:** Recommended 2026-08-07 (agent) · Owner approval: ☑ **approved 2026-08-07 (ancyloce)** — `cp3-008` is unblocked

> This ADR records a decision. It performs no removal. `cp0-006`'s acceptance criteria required
> explicit dated owner approval on pain of dropping `cp3-008`; **that approval was given on
> 2026-08-07, so `cp3-008` proceeds.** The removal steps below have still not been run.

## Context

`.gitmodules` registers 18 gitlinks. One of them, `packages/capabilities/canvas/templates`,
carries no package: no `package.json`, no source, no tests, no build. It holds three files and
a README that says so in its first sentence.

It is not the real package. `@anvilkit/canvas-templates` — ten starter `CanvasIR` designs — lives
in the monorepo at `packages/extensions/templates/canvas/`
(`packages/extensions/templates/canvas/package.json:2` declares the name; `:4` declares
`"private": true`). The stub is a seed directory created when the package was briefly expected to
be extracted, left registered when it was not.

Three facts make this more than housekeeping:

1. **It is an active gate failure, not merely dead weight.** `scripts/submodule-contract.json`
	has no entry for the stub path, and `scripts/check-submodule-contracts.mjs` treats an entry in
	`.gitmodules` with no contract entry as a violation. Run today the script exits **1** with
	`✗ packages/capabilities/canvas/templates [missing-contract-entry]`. That script is a blocking
	step in two workflows: `.github/workflows/ci.yml:171-172` (`package-gates`) and
	`.github/workflows/clean-clone.yml:92-93`.
2. **It contradicts the recorded inventory.** ADR 0002 §Context and
	`docs/architecture/repository-structure.md:165` both state 17 gitlinks; `.gitmodules` declares
	18. `docs/architecture/repository-structure.md:148-152` enumerates the submodule groups and
	does not list a templates submodule. Removing the stub makes both documents correct again
	without editing either.
3. **Every clone and every CI job pays for it.** Six `actions/checkout@v6` steps across
	`ci.yml` and `marketplace-scorecard.yml` use `submodules: recursive`, and the local
	`.git/modules/packages/capabilities/canvas/templates` residue is 228 KB.

## Evidence

### Stub inventory (exhaustive)

`packages/capabilities/canvas/templates/` contains exactly four entries, three of them tracked:

| File | Tracked | Notes |
| --- | --- | --- |
| `README.md` | yes | 11 lines; states "This directory is a stub" and points at `packages/extensions/templates/canvas/` |
| `LICENSE` | yes | 1086 bytes |
| `.gitignore` | yes | Next.js boilerplate, 36 lines, inert here |
| `.git` | n/a | gitdir pointer: `gitdir: ../../../../.git/modules/packages/capabilities/canvas/templates` |

`git -C packages/capabilities/canvas/templates ls-files` returns those three paths and nothing
else. `git status --porcelain --ignored` inside the stub returns **empty** — no untracked files,
no ignored-but-present files, no build output. There is no `package.json`.

### Inbound-reference proof

Two searches, both scoped to the working tree and excluding `node_modules`, `dist`, `.git`,
`.next`, and `.claude/worktrees`.

**Search A — the stub path (`capabilities/canvas/templates`): 12 hits, 0 of them functional.**

| Category | Count | Locations |
| --- | --- | --- |
| The registration itself | 2 | `.gitmodules:52`, `.gitmodules:53` |
| The stub's own gitdir pointer | 1 | `packages/capabilities/canvas/templates/.git:1` |
| Prose in `docs/` describing the stub as dead weight | 9 | `docs/archive/plans/0031-canvas-starter-content-library-0806-1336.md:29,81`; `docs/plans/0035-canvas-core-parity-phased-execution-0806-1854.md:114`; `docs/reviews/0007-canvas-core-editor-adversarial-review-0720-1446.md:126`; `docs/reviews/0034-plan-0035-canvas-core-parity-audit-0806-2216.md:141`; `docs/runs/0007-canvas-core-editor-adversarial-review-closeout.md:123`; `docs/tasks/0002-m4-execution-report-0715.md:53`; `docs/tasks/cp0-006-stub-submodule-retirement-signoff.md:3`; `docs/tasks/cp3-008-retire-stub-submodule.md:3` |
| **Code, config, build, or CI** | **0** | — |

Restricted to tracked files and recursed into every submodule
(`git grep -n --recurse-submodules -F 'capabilities/canvas/templates'`), the count drops to
**2 — both in `.gitmodules`**. No submodule references the stub path either.

Checked specifically and found clean: `turbo.json` (no `templates` token), every `tsconfig*.json`
(`git grep 'canvas/templates' -- '*tsconfig*.json'` → no matches), `.github/**`
(`git grep -e 'canvas/templates' -e 'canvas-templates' -- '.github/**'` → no matches).

**Search B — the package name (`@anvilkit/canvas-templates`): 51 tracked hits, 0 resolving through the stub.**

| Scope | Count |
| --- | --- |
| Superproject tracked files, excluding the lockfile | 39 |
| Inside submodules (`canvas/core` 3, `canvas/editor` 5, `plugin-canvas-studio` 1, and the stub's own README 1) | 10 |
| `pnpm-lock.yaml` importer entries (`:197`, `:430`) | 2 |

Every one of the 51 refers to the package **by npm name**, never by path. The load-bearing ones,
each line number re-verified on 2026-08-07:

- `apps/studio/package.json:34` — `"@anvilkit/canvas-templates": "workspace:*"`
- `apps/studio/app/studio/canvas/[pageId]/CanvasEditorSurface.tsx:15` — `import { canvasTemplates } from "@anvilkit/canvas-templates";`
- `apps/studio/lib/lazy-plugins.ts:261` — `import("@anvilkit/canvas-templates"),`
- `apps/docs/package.json:34` — `"@anvilkit/canvas-templates": "workspace:*"`
- `apps/docs/src/lib/canvas-studio-lazy.ts:164` — `import("@anvilkit/canvas-templates"),`

(The three citations carried over from `cp0-006`'s task file — `apps/studio/package.json:34`,
`CanvasEditorSurface.tsx:15`, `lazy-plugins.ts:261` — are all still exact. No drift.)

### Resolver-level proof

Grep alone would be weak evidence. The resolver agrees:

- **`pnpm-workspace.yaml:12` *does* glob-match the stub path** — `"packages/capabilities/canvas/*"`
	matches the `templates` directory. This is the one place the stub could plausibly have been
	picked up. It is not, because pnpm only treats a matched directory as a workspace project when
	it contains a `package.json`, and the stub has none.
- `pnpm ls --filter @anvilkit/canvas-templates --depth -1` resolves to
	`/root/Rhett/anvilkit-studio/packages/extensions/templates/canvas` — one project, one location.
- `pnpm list -r --depth -1` shows exactly two projects under `packages/capabilities/canvas`:
	`@anvilkit/canvas-core` and `@anvilkit/canvas-editor`. The stub path appears zero times.
- `pnpm-lock.yaml` has importer entries only for `packages/capabilities/canvas/core:712` and
	`packages/capabilities/canvas/editor:761`. No importer for the stub.
- The consumer symlinks point at the real package, not the stub:
	`apps/studio/node_modules/@anvilkit/canvas-templates` →
	`../../../../packages/extensions/templates/canvas`, and
	`apps/docs/node_modules/@anvilkit/canvas-templates` → the same target. There is **no** root-level
	`node_modules/@anvilkit/canvas-templates` symlink at all.

**Verdict: zero inbound references resolve through the stub path, at grep level and at resolver level.**

### Nothing worth preserving

Network was available, so this is a live check against the remote, not an inference from
remote-tracking refs.

| Check | Result |
| --- | --- |
| Working tree | `nothing to commit, working tree clean` |
| HEAD | `c9155e5901fff63d66a44456255c2f74468bbcc2`, **attached** to `refs/heads/main` (not detached) |
| Branches | one: `main`, tracking `origin/main` |
| Local commits | 2: `c9155e5` (README clarification), `f09eb7b` (initial commit) |
| Remote | `https://github.com/ancyloce/anvilkit-canvas-templates.git` |
| `git ls-remote origin` | `c9155e5901ff… HEAD` and `c9155e5901ff… refs/heads/main` — no other branches, no tags |
| Superproject gitlink | `c9155e5901ff…` in both HEAD and the index — identical to the remote tip |

**Nothing is unpushed. Nothing is orphaned. There is no gitlink drift.** Local HEAD, the
superproject gitlink, and `origin/main` are the same commit, and that commit exists on the remote.
No content would be lost by removal, and the upstream repository survives removal regardless —
retiring the gitlink does not delete `ancyloce/anvilkit-canvas-templates`.

## Decision

**Retire the `packages/capabilities/canvas/templates` submodule.** Remove its `.gitmodules` entry,
its gitlink, its `.git/config` section, and its `.git/modules` residue. Leave the upstream
GitHub repository in place; archive it there if desired, as a separate owner action.

This is consistent with ADR 0002, not an exception to it. ADR 0002 requires that "an independent
repository or submodule requires evidenced independent ownership, lifecycle, permissions, or
operational value" and that "every retained submodule must publish an ownership, toolchain,
script, CI, peer-range, Changesets, and release contract." The stub has no package and therefore
cannot satisfy any clause of that contract — which is precisely why
`scripts/check-submodule-contracts.mjs` reports it as a violation today. ADR 0002 also directs
that "counts are never copied into durable guidance; they are derived from `.gitmodules` when
needed", and that gitlinks "move only in dedicated, reversible PRs" — hence `cp3-008` as its own
change, gated on this record.

The one clause worth naming explicitly: ADR 0002 says "current submodules remain in place during
Phase 0." That applied to the seventeen submodules holding real packages. It was never a
commitment to retain an empty seed directory, and the retention decision recorded at
`docs/architecture/repository-structure.md:243` is likewise about the real packages. No conflict.

## Alternatives considered

- **Keep it, and add a contract entry to `scripts/submodule-contract.json`.** Rejected: it would
	silence the gate by declaring a contract for a package that does not exist, and every clone and
	every recursive CI checkout would keep paying for it forever.
- **Keep it, and record the violation in the contract's `knownGaps` baseline.** Rejected for the
	same reason, and worse — `knownGaps` is meant to hold audited, temporary gaps in real packages,
	not a permanent excuse for a directory with nothing in it.
- **Keep the directory but drop the gitlink**, leaving a plain pointer README in the monorepo.
	Rejected: the pointer already exists where it matters — the real package's own README and
	`docs/architecture/repository-structure.md` — and `pnpm-workspace.yaml:12`'s
	`packages/capabilities/canvas/*` glob would still match the leftover directory, leaving a live
	trap for anyone who later drops a `package.json` into it.
- **Populate the stub with the real package** (i.e. extract `@anvilkit/canvas-templates` into its
	own repo). Rejected: it fails ADR 0002's default — monorepo unless independent ownership and
	lifecycle are evidenced — and the package is `private: true`, consumed as plain data by two
	apps in this repository.
- **Do nothing.** Rejected: the standing `missing-contract-entry` violation is a blocking step in
	`ci.yml` `package-gates` and in `clean-clone.yml`.

## Removal procedure for `cp3-008` (documented, not executed)

Owner approval is recorded in the sign-off row above (2026-08-07), so this procedure is cleared to
run. **Nothing here has been run yet** — it is `cp3-008`'s work, in its own change.

1. **Re-run the inbound-reference check immediately before removal.** A concurrent session may
	have added one since 2026-08-07. Expect the same 12/2 split reported above.

	```sh
	git grep -n --recurse-submodules -F 'capabilities/canvas/templates' -- .
	```

2. **Deinit, then remove the gitlink.** `git rm` on a submodule (git 2.48.1 here) removes the
	`.gitmodules` section as well as the gitlink.

	```sh
	git submodule deinit -f packages/capabilities/canvas/templates
	git rm -f packages/capabilities/canvas/templates
	```

3. **Remove the `.git/config` residue if `deinit` left it.** **The section name matters, and this
	entry's shape differs from its neighbours.** In `.gitmodules` the stub's section is
	`[submodule "packages/capabilities/canvas/templates"]` (`.gitmodules:52`) — the section name
	equals the path. The older canvas entries do not follow that shape: their sections are
	`[submodule "packages/canvas/core"]` and `[submodule "packages/canvas/editor"]` while their
	paths are `packages/capabilities/canvas/{core,editor}`, a leftover from the Phase 3 layer move.
	`.git/config` uses the same names. So the correct incantations are:

	```sh
	git config --remove-section 'submodule.packages/capabilities/canvas/templates'
	# and, only if step 2 did not already clear it:
	git config -f .gitmodules --remove-section 'submodule.packages/capabilities/canvas/templates'
	```

	Copying the neighbours' shape (`submodule.packages/canvas/templates`) fails with
	*no such section* — that name has never existed.

4. **Delete the local module store** (228 KB; git leaves it behind deliberately):

	```sh
	rm -rf .git/modules/packages/capabilities/canvas/templates
	```

5. **Inspect the `.gitmodules` diff before staging anything.** The file has **mixed line endings
	today — 26 of its 54 lines are CRLF** — while `.gitattributes:7` declares `* text=auto eol=lf`.
	The stub's own three lines (52-54) are LF. Confirm `git diff .gitmodules` shows a three-line
	deletion and nothing else; if the whole file re-renders, a tool normalized the other 26 lines
	and that churn must be reverted rather than shipped.

6. **Verify.**

	```sh
	git submodule status | grep templates     # expect: no output
	node scripts/check-submodule-contracts.mjs  # expect: the missing-contract-entry line is gone
	pnpm ls --filter @anvilkit/canvas-templates --depth -1  # expect: packages/extensions/templates/canvas
	```

	`check-submodule-contracts.mjs` will still exit non-zero on the unrelated pre-existing
	violation `packages/extensions/components [missing-script:build]`. That is not this change's
	regression; confirm it is the *only* remaining violation.

7. Then run `cp3-008`'s own acceptance checks: fresh-clone simulation
	(`git submodule update --init --recursive` + `pnpm install` + build `apps/studio`),
	`pnpm gate:full`, and the `submodule-integrity` audit.

`scripts/submodule-contract.json` needs **no** edit — it has no entry for the stub, which is the
violation being resolved.

## What a stale checkout sees after removal

**One-line note for the team:** *after pulling, the now-unregistered
`packages/capabilities/canvas/templates/` directory will still be sitting on your disk as an
untracked "embedded repository" — git will not delete a populated submodule for you — so run
`rm -rf packages/capabilities/canvas/templates && git config --remove-section
'submodule.packages/capabilities/canvas/templates' && rm -rf
.git/modules/packages/capabilities/canvas/templates` once; nothing else is affected.*

The detail behind it:

- `git pull` drops the gitlink from the tree, but git refuses to remove a submodule working tree
	that still has its own `.git`, so the directory and its three files linger. `git status` then
	reports it as an untracked directory.
- The stale `[submodule "packages/capabilities/canvas/templates"]` section stays in the user's
	local `.git/config`, and `.git/modules/packages/capabilities/canvas/templates` stays on disk.
	Neither is harmful; both are noise.
- `git submodule status` and `git submodule update --init --recursive` read `.gitmodules`, so once
	the entry is gone the stub is simply skipped — no error, no prompt.
- **`pnpm install` is unaffected either way.** The leftover directory is still matched by
	`pnpm-workspace.yaml:12`'s `packages/capabilities/canvas/*` glob, but with no `package.json` it
	is not a project, so nothing changes in the resolution graph. This is also the reason removal
	needs no lockfile change.

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| A build or import breaks because something resolved through the stub | **None observed** | High if real | Proven at both grep and resolver level: 0 functional references; `pnpm ls` resolves the name to `packages/extensions/templates/canvas`; the consumer symlinks target that path |
| Unpushed or orphaned commits lost | **None** | High if real | `git ls-remote` confirms `origin/main` == local HEAD == the superproject gitlink (`c9155e5`); working tree clean; HEAD attached |
| Upstream repository content lost | None | High if real | Removing a gitlink does not touch the remote. `ancyloce/anvilkit-canvas-templates` survives; archive it separately if desired |
| Stale checkouts confused by the lingering directory | Likely | Low | The one-line note above, shipped with the change description |
| Not cleanly reversible for someone mid-rebase across the change | Moderate | Low | Land as its own commit/PR (ADR 0002: "move gitlinks only in dedicated, reversible PRs"); re-adding the gitlink is a one-line `.gitmodules` revert since the remote still exists |
| `.gitmodules` line-ending churn slips in | Moderate | Low | Step 5 — inspect the diff; the file is 26/54 CRLF today against `.gitattributes:7` `eol=lf` |
| Another `.gitmodules` entry disturbed | Low | High | Step 6 — `git submodule status` must still list the other 17 unchanged |

**Overall: low risk, and it clears a currently-failing gate.** The residual risk is entirely
about other people's local checkouts, not about this repository's correctness.

## Consequences

- `.gitmodules` drops from 18 gitlinks to 17, restoring agreement with ADR 0002 §Context and
	`docs/architecture/repository-structure.md:165` without editing either document.
- `node scripts/check-submodule-contracts.mjs` loses its `missing-contract-entry` violation. One
	pre-existing violation remains (`packages/extensions/components [missing-script:build]`) plus
	the 19 audited `knownGaps` warnings; those are out of scope here.
- Recursive checkout in `ci.yml` and `marketplace-scorecard.yml` clones one fewer repository.
- `@anvilkit/canvas-templates` continues to resolve to `packages/extensions/templates/canvas` for
	`apps/studio` and `apps/docs`, unchanged.
- Anyone with an initialized checkout does a one-time manual cleanup (see the note above).

## Follow-up actions

- **Owner:** ✅ done — approval recorded in the sign-off row at the top of this ADR, dated
	2026-08-07. `cp3-008` proceeds.
- **`cp3-008`:** execute the procedure above, in its own change, and ship the stale-checkout note
	in the change description.
- **Owner, separate and optional:** archive `github.com/ancyloce/anvilkit-canvas-templates` so the
	stub repository is not mistaken for a live package.

## Incidental finding (out of scope, not fixed here)

`.claude/skills/release-prep/SKILL.md:70` asserts that `@anvilkit/canvas-templates` "has no
`private: true` guard". That is stale: `packages/extensions/templates/canvas/package.json:4`
declares `"private": true`. The instruction to never publish it remains correct; only the stated
reason is out of date. Flagged for whoever owns that skill file.
