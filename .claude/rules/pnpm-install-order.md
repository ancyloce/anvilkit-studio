---
paths:
  - "apps/docs/Dockerfile"
  - "apps/studio/Dockerfile"
  - ".github/actions/setup-workspace/action.yml"
---

# pnpm install order: components workspace before root

`packages/extensions/components` is a nested pnpm workspace with its own
`pnpm-workspace.yaml`, which also claims `packages/runtime/ui`,
`packages/capabilities/analytics/*`, and `packages/tooling/configs/*`.
Those shared packages are members of BOTH workspaces, so whichever `pnpm
install` runs LAST owns their `node_modules` symlinks.

**Always run in this order:**

```sh
pnpm --dir packages/extensions/components install --frozen-lockfile --config.strictDepBuilds=false
pnpm install --frozen-lockfile
```

Reversing the order silently swaps in the components workspace's dependency
tree for those shared packages, causing two distinct failure modes:

- **Duplicate React / `Cannot read properties of null (reading 'useRef')`**
  — the components store carries its own physical `react` copy and an
  unpatched `@base-ui/react` (root `patchedDependencies` don't apply to the
  nested workspace). Any root-workspace test that renders `@anvilkit/ui`
  crashes.
- **Spurious `TS7016` in `analytics/react`** — the components store pins a
  newer `typescript@7.0.2` vs. the root's `7.0.2`, which forces
  `rsbuild-plugin-dts` onto its `tsgo` (TypeScript-Go native-preview)
  declaration backend, which fails resolving a sibling workspace package's
  types.

`.github/actions/setup-workspace/action.yml` has a "Verify single React
instance" step that fails CI fast if this ever regresses. Both
`apps/docs/Dockerfile` and `apps/studio/Dockerfile` must mirror the same
install order — if you add another Dockerfile or CI job that runs `pnpm
install` against this repo, mirror it there too.

Separately: the root lockfile pins `typescript@7.0.2` while the workspace
declares `^7.0.2` — pre-existing drift, not fixed by the install-order rule
above. Do not conflate the two.
