# Changesets

This directory is the **root-workspace** Changesets store for `anvilkit-studio`. It versions every package matched by the top-level `pnpm-workspace.yaml` except the two named in `config.json`'s `ignore` list (`studio`, `playground`). Run `pnpm changeset status` for the authoritative list — it is the only statement of that set that cannot go stale.

The component packages in `packages/extensions/components/src/*` are versioned by the **components submodule's** own `.changeset/` store (`packages/extensions/components/.changeset/`). Do not add changesets for `@anvilkit/button`, `@anvilkit/hero`, etc. here — they belong in the submodule.

## The Canvas packages are versioned here, and they are submodules

`@anvilkit/canvas-core` (`packages/capabilities/canvas/core`) and `@anvilkit/canvas-editor` (`packages/capabilities/canvas/editor`) are **published, not private, not ignored**, so they are versioned by *this* store — unlike the component packages, they do **not** have a `.changeset/` of their own. `pnpm changeset status` lists both. Every user-visible change to either one needs a changeset here.

Two things about them are easy to get wrong, both settled by PLAN-0035 `cp6-005` (2026-08-11):

1. **They also keep a hand-written `## Unreleased` narrative in their own `CHANGELOG.md`.** That is deliberate and it is *not* a substitute for a changeset — the changeset carries the semver bump and the released entry; the narrative carries the long-form explanation. `changeset version` inserts its generated `## <version>` block **immediately under the `#` title**, i.e. *above* the narrative: `@changesets/apply-release-plan`'s `prependFile` splices at the file's **first newline** (`fileData.slice(0, index) + data + fileData.slice(index + 1)`), so everything below the title line is pushed down. Two consequences for the releaser, in this order:
	- Retitle `## Unreleased` to the version just cut and open a fresh empty one, or the narrative for shipped work goes on claiming to be unreleased. Skipping this is what produced the `## Unreleased` heading stranded below three released versions in `packages/runtime/core/CHANGELOG.md`.
	- Move the `RELEASE CONVENTION` HTML comment back under the `#` title. It is deliberately the first thing below the title, where whoever edits the file will see it; the splice puts the generated release block above it.
2. **This store is in the superproject; the packages are submodules.** `changeset version` writes `CHANGELOG.md` and `package.json` *inside the submodule working tree*, which the superproject records only as a gitlink. Commit and push each submodule on its own **before** the superproject's release commit, or the published tarball and the recorded gitlink disagree.

## How to add a changeset

```bash
pnpm changeset          # interactive: pick packages + bump type + summary
pnpm changeset:status   # preview what a `version` run would release
```

## Known hazard — `changeset version` reformats with Prettier

Changesets formats every `CHANGELOG.md` it writes with **Prettier** unless told not to, and `prettier@3.9.6` *is* resolvable from this workspace root — so a `version` run will reformat these files with a formatter [CLAUDE.md](../CLAUDE.md) forbids ("Formatting is Biome with TAB indentation. Never run Prettier."). Nothing has tripped it yet because no `version` run has happened since the rule landed; the pending changesets are all still queued.

`@changesets/config@3.1.4` supports an opt-out and the fix is one line in `config.json`:

```json
"prettier": false
```

It is **not** set today. Flipping it changes the generated formatting for *every* package in the store, not just the Canvas pair, so it is left to whoever owns the next release rather than taken as a side effect of a docs task (PLAN-0035 `cp6-005`, 2026-08-11).

## Release policy — `fixed` group

`.changeset/config.json` declares **one** `fixed` group, holding twelve packages: `@anvilkit/contracts`, `@anvilkit/core`, `@anvilkit/ir`, `@anvilkit/schema`, `@anvilkit/validator`, `@anvilkit/utils`, `@anvilkit/ui`, and the `plugin-ai-copilot` / `plugin-asset-manager` / `plugin-export-html` / `plugin-export-react` / `plugin-version-history` plugins. Read the file for the authoritative list.

Packages in a `fixed` group always version in lockstep: any bump to one bumps every other member to the same version, even if it did not change in that cycle.

**`fixed` is a version-locking group, not an eligibility list** — this is the misreading to guard against. A package's *absence* from `fixed` says nothing about whether this store releases it. `@anvilkit/canvas-core` and `@anvilkit/canvas-editor` are absent from every group and are released here, on their own cadence, precisely so a Canvas bump does not drag the Studio runtime with it. The only authoritative statement of what this store releases is `pnpm changeset status`; the only exclusions are `config.json`'s `ignore` list and `"private": true`.

Changesets validates at read time that every package named in `fixed` exists in the workspace, so a rename or a removal must be reflected here or `pnpm changeset status` fails with a `ValidationError`.

**Do not add packages to this group without an explicit architecture decision.** Future groups would be added as additional sub-arrays — the `fixed` option is an array of arrays precisely to allow this.

## Release policy — `ignore`

`config.json`'s `ignore` list holds exactly two entries: `studio` (the reference app at `apps/studio/`, renamed from `apps/demo` in Phase 1) and `playground` (the package-compatibility app at `apps/playground/`). Both are also `"private": true`; the `ignore` entries keep Changesets from ever attempting to version or publish them.

## Further reading

- [Changesets `fixed` docs](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md#fixed-array-of-arrays-of-package-names)
- [Problems publishing in monorepos](https://github.com/changesets/changesets/blob/main/docs/problems-publishing-in-monorepos.md)
