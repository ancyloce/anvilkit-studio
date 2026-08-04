---
paths:
  - "package.json"
  - "turbo.json"
  - "pnpm-workspace.yaml"
  - "pnpm-lock.yaml"
  - ".github/workflows/**"
  - "**/Dockerfile"
  - "**/scripts/check-*.mjs"
---

# Gate playbook — known failure modes, signatures, and verified remedies

Consumed by `.claude/skills/gate-guardian/SKILL.md`. One entry per failure mode
that has already been root-caused in this repo.

**Classification vocabulary** (used by the guardian):

- `ENVIRONMENT_ROT` — the tree is fine; the machine, cache, install order, or
  scheduler is wrong. Safe to auto-remedy.
- `CODE_REGRESSION` — a real change broke it. Report and bisect; **never**
  auto-revert the user's work.
- `PRE_EXISTING` — red on clean `HEAD` too. Not yours; report and move on.
- `UNKNOWN` — no signature matches. Root-cause from scratch, then append an entry.

**Confidence** is stated per entry. `VERIFIED` = reproduced and the remedy was
observed to work in this repo. `PARTIAL` = mechanism confirmed, exact error
string not captured — match loosely and confirm before acting.

---

## GP-001 — Stale Next.js build cache after a workspace package rebuild

- **Class:** ENVIRONMENT_ROT · **Confidence:** VERIFIED
- **Signature:**
  `Cannot read properties of undefined \(reading '(length|split)'\)`
  · `getByTestId\('ak-write-target'\).*not found`
  · editor route stuck at `status "Loading"`
- **Root cause:** rebuilding `@anvilkit/core` (or any workspace package) `dist/`
  **without bumping its version** leaves `apps/*/.next` holding the previous
  build — Next treats `node_modules` workspace packages as immutable by version.
  A running `next dev` also keeps pre-rebuild modules resident in memory, so
  clearing the cache alone is not enough.
- **Tell it is not your code:** the *pre-existing* baseline spec
  (`apps/studio/e2e/editor/visual-editor.spec.ts`) fails identically. Run the
  baseline before believing a new spec is at fault.
- **Remedy** (order matters):
  ```sh
  # 1. Is a dev server alive on the port? NEVER delete .next while one is running.
  ss -tlnp | grep -E ':(3000|3100)' || echo "no dev server"
  # 2. Kill it if its start time predates your rebuild:
  #    ps -o lstart= -p $(ss -tlnp | grep :3000 | grep -oP 'pid=\K[0-9]+')
  # 3. Only then:
  rm -rf apps/studio/.next
  ```
- **Verify fixed:** re-run the baseline spec; `/puck/editor` pays a 60–90 s cold
  compile on the next run (expected, not a hang).
- **Note:** `playwright.config.ts` sets `reuseExistingServer: true` locally, which
  is why a stale server survives a cache wipe.

## GP-002 — Bare `rslib build` wipes compiled CSS out of `dist/`

- **Class:** ENVIRONMENT_ROT · **Confidence:** VERIFIED
- **Signature:** missing `dist/react/overrides/styles.css`; unstyled `<Studio>`;
  a gate that shells out to `rslib build` leaving the package half-built.
- **Root cause:** `@anvilkit/core`'s real build is `rslib build && pnpm build:css`.
  A bare `pnpm exec rslib build` cleans `dist/` and, skipping `build:css`,
  **deletes** the 103 KB compiled `styles.css`. Any script that invokes rslib
  directly (e.g. a `check:bundle-budget` internal build) can leave the package in
  that state.
- **Remedy:** `pnpm --filter @anvilkit/core build` (the full script, never bare rslib).
- **Verify fixed:** `ls -la packages/runtime/core/dist/react/overrides/styles.css`.

## GP-003 — api-snapshot regeneration bakes CRLF and falsely fails the gate

- **Class:** ENVIRONMENT_ROT · **Confidence:** VERIFIED
- **Signature:** `check:api-snapshot*` exits 1 with a large diff whose changed
  lines are doc-comment `text` fields; `grep -aFc '\r\n' api/api-snapshot.json` > 0.
- **Root cause:** this WSL box has `core.autocrlf=true`. The root `.gitattributes`
  (`* text=auto eol=lf`) fixes the main repo but **does not cascade into
  submodules** — each submodule is its own git repo. Sources land CRLF on disk;
  typedoc serialises `\r\n` into the snapshot. Committed blobs are LF, so CI
  disagrees. A `git stash` round-trip inside a submodule re-introduces it.
- **Remedy:**
  ```sh
  sed -i 's/\r$//' <affected source files>   # plain byte edit; git ops re-smudge
  # regenerate, then confirm:
  grep -aFc '\r\n' <snapshot.json>           # must be 0
  ```
  Do **not** re-run the gate afterwards on this box — it re-pollutes.
- **Verify fixed:** `git diff` shows only the intended semantic change and zero
  `\r\n` lines.

## GP-004 — api-snapshot drops GitHub URLs for untracked new files

- **Class:** ENVIRONMENT_ROT · **Confidence:** VERIFIED
- **Signature:** snapshot diff removes many `"url": ".../blob/main/..."` entries
  while `fileName`/`line` remain; passes locally, drifts on CI.
- **Root cause:** typedoc resolves source links via `git ls-files`. A new,
  untracked file is not listed, so it gets no blob URL. CI has the file committed
  and emits the URL.
- **Remedy:** `git add` the new files **before** regenerating (staging is enough —
  `git ls-files` reads the index), regenerate, strip CRLF per GP-003, then
  `git reset` to leave the tree unstaged for the user.
- **Verify fixed:** a move-only diff is balanced (equal `+`/`-`) and every changed
  line is a source-location field.

## GP-005 — Nested pnpm workspace install order clobbers TypeScript / React

- **Class:** ENVIRONMENT_ROT · **Confidence:** VERIFIED
- **Signature:** `TS7016` in `analytics/react`
  · `Cannot read properties of null \(reading 'useRef'\)`
  · duplicate-React failures in any test rendering `@anvilkit/ui`
- **Root cause:** `packages/extensions/components` is a **nested pnpm workspace**
  that also claims `packages/runtime/ui`, `packages/capabilities/analytics/*`, and
  `packages/tooling/configs/*`. Those are members of both workspaces, so whichever
  `pnpm install` runs **last** owns their `node_modules` symlinks.
- **Remedy** — always this order:
  ```sh
  pnpm --dir packages/extensions/components install --frozen-lockfile --config.strictDepBuilds=false
  pnpm install --frozen-lockfile
  ```
- **Verify fixed:** `pnpm why typescript` in the failing package; and the
  "Verify single React instance" step in
  `.github/actions/setup-workspace/action.yml`.
- **See also:** the dedicated rule `.claude/rules/pnpm-install-order.md`.

## GP-006 — madge / typedoc crash on the TypeScript 7 (tsgo) compiler API

- **Class:** ENVIRONMENT_ROT · **Confidence:** VERIFIED
- **Signature:** `ts.createCompilerHost is not a function`
  · `reading 'Cjs'` · `reading 'PropertyDeclaration'`
- **Root cause:** TypeScript 7.0.2 is the native `tsgo` build and drops the old JS
  compiler API that madge's chain (detective-typescript, typescript-estree,
  filing-cabinet) and typedoc still call. Kills every `check:circular`, root
  `pnpm madge`, and every `check:api-snapshot`.
- **Important:** these failures **cascade** — only the first is real; the rest
  appear as SIGINT "Failed" noise in turbo output. Do not triage them individually.
- **Remedy:** root `.pnpmfile.cjs` converts the `typescript` **peer** of those
  packages into a regular dep on `6.0.3`, plus scoped
  `parent>child` overrides in `pnpm-workspace.yaml` listed **before** the bare
  `typescript` pin (first match wins).
- **Verify fixed:** `pnpm madge` and one package's `check:api-snapshot` both run to
  completion.

## GP-007 — `tsconfig` `paths` ignored without `baseUrl` under Next webpack

- **Class:** CODE_REGRESSION (config) · **Confidence:** PARTIAL
- **Signature:** unresolved path-alias imports that only fail in the **webpack**
  dev/build path while `tsgo` typecheck and Turbopack both pass.
- **Root cause:** Next's webpack mode ignores `tsconfig` `paths` when `baseUrl` is
  absent; Turbopack and tsgo tolerate it. A `baseUrl`-removal commit therefore
  breaks only webpack builds.
- **Remedy:** restore `baseUrl`, or convert the offending alias imports to
  relative paths.
- **Verify fixed:** build the affected app in webpack mode.
- **⚠ Unverified:** this entry was reported to also surface as `TS5102` / `TS2883`.
  Those exact codes are **not** attested anywhere in this repo's history — match on
  the mechanism above, and confirm before acting on a code match alone.

## GP-008 — EADDRINUSE on a port nothing is listening on

- **Class:** ENVIRONMENT_ROT · **Confidence:** VERIFIED
- **Signature:** `EADDRINUSE` while `ss -tnlp` / `lsof` show nothing, and
  `/proc/net/tcp*` is empty.
- **Root cause (two distinct causes — check both):**
  1. **Orphaned Playwright webServer / dev server** still holding the port.
  2. **Windows kernel port reservation** (Hyper-V dynamic exclusion ranges) on
     this WSL2 box — ports **1234** and **11234** are blocked on every interface
     and no Linux tool can show it. Empirically free: 11000, 11500, 12000, 13000,
     21234.
- **Remedy:**
  ```sh
  ss -tlnp | grep ":<port>" || echo "nothing listening — suspect Windows reservation"
  pkill -f playwright || true
  ```
  If nothing is listening, move the port rather than hunting zombies.
- **Verify fixed:** the server binds and the E2E suite boots. Note that
  `apps/studio`'s Playwright webServer takes **~2.5 min** to boot with no browser
  process visible early — that is normal, not a hang.

## GP-009 — Docker build fails on `--frozen-lockfile` after submodule drift

- **Class:** ENVIRONMENT_ROT · **Confidence:** PARTIAL
- **Signature:** `ERR_PNPM_OUTDATED_LOCKFILE` / frozen-lockfile failure inside a
  `docker build`, while a local `pnpm install` succeeds.
- **Root cause:** the workspace packages the apps depend on live in **git
  submodules**, and both `apps/studio/Dockerfile:52-53` and
  `apps/docs/Dockerfile:38-39` install with `--frozen-lockfile`. If a submodule's
  `package.json` has moved ahead of the root `pnpm-lock.yaml` (or the image was
  built from a checkout without `submodules: recursive`), the frozen install
  fails. `.github/workflows/docker-images.yml:54` sets `submodules: recursive`
  precisely for this.
- **Remedy:** update the gitlinks and regenerate the lockfile deliberately —
  **never** regenerate a lockfile without diffing it first:
  ```sh
  git submodule status                    # confirm gitlinks
  pnpm install --lockfile-only && git diff pnpm-lock.yaml   # review BEFORE accepting
  ```
- **Verify fixed:** `pnpm install --frozen-lockfile` succeeds from a clean clone
  (`.github/workflows/clean-clone.yml` gates this).

## GP-010 — Parallel `turbo run test` times out tests that pass standalone

- **Class:** ENVIRONMENT_ROT · **Confidence:** VERIFIED (2026-08-04, this repo)
- **Signature:** several tests failing at **~5000 ms each** (vitest's default
  timeout) across multiple files in one package, plus
  `Promise returned by .*toMatchFileSnapshot.* was not awaited`.
- **Root cause:** `turbo.json` sets `"concurrency": "32"`. Under a full-workspace
  `pnpm test`, async file-snapshot I/O contends and trips the 5 s timeout. The
  same tests pass with room to spare in isolation. This is the
  "phantom concurrency oversubscription" pattern the `release-gate-triager`
  subagent already names.
- **Observed instance:** `@anvilkit/plugin-export-html` — **9 failures** across
  `inline-assets`, `warnings`, `asset-resolvers`, and `metadata` test files under
  `pnpm test` (52/66 tasks), but **145/145 tests pass** via
  `pnpm --filter @anvilkit/plugin-export-html vitest run`.
- **Remedy / triage:** re-run the failing package alone. If it goes green, the
  workspace run is the problem, not the code:
  ```sh
  pnpm --filter <pkg> vitest run
  # or lower contention for the whole run:
  pnpm exec turbo run test --concurrency=4
  ```
- **Verify fixed:** the isolated run is green and the failure count in the
  workspace run drops when concurrency is lowered.
- **Durable fix (NOT yet applied):** raise `testTimeout` for the file-snapshot
  suites, `await` the `toMatchFileSnapshot` assertions, or cap test concurrency in
  `turbo.json`. Flagged, not implemented — it touches a submodule's test config.

## GP-011 — rslib persistent build cache SIGABRT under parallel builds

- **Class:** ENVIRONMENT_ROT · **Confidence:** VERIFIED
- **Signature:** exit code **134** · `Transaction already in progress`
- **Root cause:** rslib's default persistent `buildCache` races when several
  package builds run in parallel.
- **Remedy:** set `performance.buildCache: false` in the affected `rslib.config.ts`,
  or serialise the build (`--concurrency=1`).
- **Verify fixed:** the build completes with exit 0 twice in a row.

## GP-012 — A concurrent session mutated the checkout mid-run

- **Class:** ENVIRONMENT_ROT · **Confidence:** VERIFIED
- **Signature:** a package that was green minutes ago is suddenly red, and the
  failing files are ones this session never touched.
- **Root cause:** a second agent/editor session works this same checkout and can
  commit under the user's identity mid-run. On 2026-07-27 it landed a
  `@anvilkit/ui` rewrite ~40 minutes into an already-green E2E run.
- **Remedy:** `git status` and `git log --oneline -5` before and after any long
  run. Re-read any file before re-editing it. Do not "fix" a failure you did not
  cause.
- **Verify fixed:** `git log` shows no foreign commits during the run window.

## GP-013 — Known PRE_EXISTING reds (do not attribute these to your change)

- **Class:** PRE_EXISTING · **Confidence:** see per-item status
- **This list decays.** Entries here were true when written and several have since
  been fixed. **Always confirm an item still reproduces before quoting it** — a
  stale PRE_EXISTING claim is worse than no entry, because it excuses a real
  regression. Re-verified 2026-08-04:

  | Item | Status 2026-08-04 | Evidence |
  | --- | --- | --- |
  | `@anvilkit/ui` lint — 3 Biome errors (`noExplicitAny`, `noEmptyBlockStatements`) | **STALE — now passes** | `pnpm --filter @anvilkit/ui lint` → exit 0, 25 files, 0 errors |
  | `@anvilkit/core` typecheck — `use-reactive-puck.test.tsx` drift vs `UsePuckStore<Config>` | **STALE — now passes** | workspace typecheck 90/90 successful |
  | `@anvilkit/core` vitest jest-dom flake (`Invalid Chai property: toBeInTheDocument`) | did not reproduce | `core#test` not among failures in the 2026-08-04 workspace run |
  | `apps/studio` `sidebar-modules.spec.ts` visual-regression + axe — no committed Linux baselines | **unverified this run** | E2E is not part of `gate:quick`/`gate:full`; treat as open |

- **Resolved, do not re-add:** `@anvilkit/plugin-export-react`
  `check:bundle-budget` overflow was fixed by trimming on 2026-07-31.
- `@anvilkit/core` lint — 2 `noArrayIndexKey` errors in `studio/primitives/`
  (`field.tsx`, `slider.tsx`) — **fixed 2026-08-04**: `field.tsx` keys by
  `error.message` (unique by construction via the existing `Map` dedupe);
  `slider.tsx` carries a scoped `biome-ignore` matching the package's existing
  convention for positional lists. Do not re-report.

---

## Appending a new entry

The guardian appends here after root-causing an `UNKNOWN`. Required fields: ID
(next free `GP-0NN`), class, confidence, a regex-matchable signature, root cause,
remedy commands, and a verification command. State the date and the observed
instance. Never write a remedy that has not actually been run.
