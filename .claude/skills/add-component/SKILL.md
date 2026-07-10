---
name: add-component
description: >-
  Scaffold a new @anvilkit/<slug> component package and thread it through every
  wiring site — demo puck config, next.config transpilePackages, demo
  package.json dep — then validate through the gates and stage a changeset.
  Use when asked to "add a component", "scaffold <name> component",
  "/add-component <slug>", or to wire a new component into the demo.
disable-model-invocation: true
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Grep
  - Glob
  - Agent
---

# add-component

Codifies the multi-file ritual for adding a publishable `@anvilkit/<slug>` component.
A new component is useless until it is wired into **every** mount, so this skill
scaffolds, wires each site, verifies, and stops before any commit/publish (the user
handles commits — never run `git commit`).

## Inputs

Ask only if not supplied: `slug` (kebab-case, e.g. `feature-grid`), display `label`,
`template` (`content` | `layout` | `form`), optional `category`
(one of: `navigation`, `marketing`, `actions`, `forms`, `canvas`).

## Step 0 — Enumerate before editing

Per CLAUDE.md's sub-agent rule, do NOT start editing until call sites are mapped.
Spawn the **wiring-enumerator** agent to confirm the current set of wiring sites
(the list below is the baseline; the agent catches drift):

```
Agent(subagent_type: "wiring-enumerator",
      prompt: "Enumerate every site that must change to add a new @anvilkit component
               package to the demo and docs. Report file:line for puck-demo.ts imports,
               DemoComponents type, categories map, components map; next.config.js
               transpilePackages; demo package.json deps; root package.json devDeps.")
```

## Step 1 — Scaffold (in `packages/components/` submodule)

```bash
cd packages/components
pnpm gen:component -- --name <slug> --label "<Label>" --template <template> [--category <category>]
```

This emits `src/<slug>/` with `package.json`, `rslib.config.ts`, `tsconfig.json`, and
`src/{component.tsx, config.ts, index.ts, styles.css, styles.d.ts}`.

Then implement:
- `src/<Slug>.tsx` — render component; **serializable props only** (no functions/refs at top level)
- `src/config.ts` — exports `componentConfig`, `fields`, `defaultProps`, `metadata`
- `src/index.ts` — re-exports the above plus the `<Name>Props` type

### Component gotchas (verify, don't assume)
- **Tailwind entry**: styles must import `@anvilkit/tailwind-config/component` (preflight-free,
  source-scoped) — NOT `/shadcn`. Repointing to `/shadcn` re-introduces ~1.8 MB CSS dup.
- **rslib build cache**: confirm the generated `rslib.config.ts` has `performance.buildCache: false`
  — without it, parallel component builds crash `exit 134` ("Transaction already in progress").
- **`@anvilkit/ui` peer range**: if the component depends on `ui`, its peer range must cover the
  shipped `ui` version (core pins `ui` exactly via `workspace:*`) or consumers hit ERESOLVE.

### Validate in the components workspace
```bash
pnpm --filter @anvilkit/<slug> lint
pnpm --filter @anvilkit/<slug> typecheck
pnpm --filter @anvilkit/<slug> build
```

## Step 2 — Wire into the demo (main repo)

Edit each site for `@anvilkit/<slug>` (component `<Name>`, lowerCamel `<name>`):

1. **`apps/studio/package.json`** → add `"@anvilkit/<slug>": "workspace:*"` to `dependencies` (alphabetical).
2. **`apps/studio/next.config.js`** → add `"@anvilkit/<slug>"` to `transpilePackages` (alphabetical).
3. **`apps/studio/lib/puck-demo.ts`** — four edits:
   - **import**: `import { type <Name>Props, componentConfig as <name>ComponentConfig, defaultProps as <name>DefaultProps } from "@anvilkit/<slug>";` (drop `defaultProps` if the component doesn't export one — see `DesignBlock`).
   - **`DemoComponents` type**: add `<Name>: <Name>Props;`
   - **`categories.<category>.components`**: add `"<Name>"` to the array.
   - **`components` map**: add `<Name>: <name>ComponentConfig,`
   - *(optional)* seed a starter page's content with `{ type: "<Name>", props: { id: "...", ...<name>DefaultProps } }`.
4. **`apps/docs`** — component doc pages are generator-driven (`scripts/generate-*` emit MDX);
   no hand-wiring. The docs Playground mirrors the demo's **plugin** set, not individual
   components, so no Playground edit is needed for a plain component.

If the enumerator surfaced any extra mount (e.g. root `package.json` devDeps used by the
bench harness), wire those too.

## Step 3 — Link & verify gates

```bash
pnpm install                          # link the new workspace dep
pnpm --filter studio typecheck
pnpm --filter studio lint
pnpm --filter studio build              # confirms transpilePackages + Puck config compose
```

Run `pnpm build` first if module-resolution errors appear (dist may be missing) before
treating them as code issues.

## Step 4 — Changeset (stage, don't commit)

Components live in the `packages/components/` submodule with its **own** workspace and
changeset config — they are NOT in the main repo's `fixed` group.

```bash
cd packages/components && pnpm changeset    # choose @anvilkit/<slug>, pick semver bump
```

> If changesets are orphaned for components (known issue), the bump may need to be made by
> editing the component `package.json` `version` directly at release time — see
> the `release-prep` skill.

## Report

Output a checklist of every site touched (file:line), the gate results, and the staged
changeset path. Do **not** commit, push, or publish — leave that to the user.
