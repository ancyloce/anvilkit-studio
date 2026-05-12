# Changesets

This directory is the **root-workspace** Changesets store for `anvilkit-studio`. It versions packages that live directly in the top-level `pnpm-workspace.yaml` — currently `@anvilkit/ui`, `@anvilkit/utils`, and (once scaffolded) `@anvilkit/core`.

The component packages in `packages/components/src/*` are versioned by the **components submodule's** own `.changeset/` store (`packages/components/.changeset/`). Do not add changesets for `@anvilkit/button`, `@anvilkit/hero`, etc. here — they belong in the submodule.

## How to add a changeset

```bash
pnpm changeset          # interactive: pick packages + bump type + summary
pnpm changeset:status   # preview what a `version` run would release
```

## Release policy — `fixed` group

`.changeset/config.json` currently declares an **empty** `fixed` array:

```json
"fixed": []
```

This is a deliberate placeholder. Once `core-004` scaffolds `@anvilkit/core`, flip it to:

```json
"fixed": [["@anvilkit/core"]]
```

Changesets validates at read-time that every package listed in `fixed` exists in the workspace. Until `@anvilkit/core` is scaffolded, it cannot be listed — doing so would cause `pnpm changeset status` to fail with a `ValidationError`. The entry is therefore held out until the package is real.

Packages in the `fixed` group always version in lockstep: any bump to one package bumps every other package in the group to the same version, even if they did not change in that release cycle. The Studio runtime is the only group member because its types, runtime, config, and React shell all re-export from one entry point, so they must bump together.

**Do not add other packages to this group without an explicit architecture decision.** In particular, `@anvilkit/ui` and `@anvilkit/utils` are intentionally versioned independently from Core so hosts can upgrade them on their own cadence.

Future groups (e.g. bundling `@anvilkit/plugin-export-html` and `@anvilkit/plugin-ai-copilot` together) would be added as additional sub-arrays — the `fixed` option is an array of arrays precisely to allow this.

## Release policy — `ignore`

`demo` (the Next.js validation app at `apps/demo/`) is `"private": true` and listed under `ignore` so Changesets never attempts to publish it.

## Further reading

- [Changesets `fixed` docs](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md#fixed-array-of-arrays-of-package-names)
- [Problems publishing in monorepos](https://github.com/changesets/changesets/blob/main/docs/problems-publishing-in-monorepos.md)
