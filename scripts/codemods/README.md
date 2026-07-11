# Codemod: inline `style={{…}}` → Tailwind `className`

`inline-style-to-tailwind.mjs` (ts-morph) converts **static, common** inline
styles to Tailwind classes and removes the `style` prop. It is **safe by
construction**:

- **Whole-object only** — a `style` prop is converted only if *every* property
  maps to a Tailwind class *and* every value is a literal. Any spread
  (`...style`), shorthand (`{ maxHeight }`), dynamic/expression value, CSS custom
  property (`--x` / `var()` / `clamp()` / `calc()`), unknown property, or
  unmappable value ⇒ the **entire** prop is left untouched.
- **className merge** happens only when the existing `className` is a plain string
  literal; an expression `className` (`cn(…)`, template) ⇒ the prop is preserved.
- Handles colors, spacing, sizing, layout, fl/grid, typography (the "common"
  set); deliberately skips transforms, gradients, masks, motion values
  (`x`/`y`/`rotate`), and Konva node props.

## Usage

```bash
# dry-run (default; writes a report, touches no files)
node scripts/codemods/inline-style-to-tailwind.mjs --glob "apps/studio/**/*.tsx" --report out.md

# apply (backs up each file to .codemod-backups/ before writing)
node scripts/codemods/inline-style-to-tailwind.mjs --glob "<glob>" [--glob …] --apply
```

Globs always exclude `node_modules` (incl. pnpm symlinks), `dist`, `.next`,
`.vercel`, `.turbo`, `build`.

## What was applied

Applied to **`apps/studio` + `apps/docs` only** — **16 conversions across 7 files**
(see `report-applied.md`). Verified: Biome lint clean, both apps `typecheck` = 0.
These are app-level, main-document elements where the app's own Tailwind build
resolves the new classes.

## Deliberately NOT auto-applied (opt-in — see `report-optin-candidates.md`)

21 further conversions are possible but were left for human review because repo
conventions make a blind apply risky:

| Area | Why not auto-applied |
|---|---|
| `packages/runtime/ui`, `packages/runtime/core` (mostly **vendored `animate-ui`**) | Consumed inside the **Puck/canvas iframe** where Tailwind utilities don't reach (CLAUDE.md); `core` ships a **compiled self-contained `styles.css`** needing `build:css`; vendored code shouldn't diverge from upstream. |
| `packages/cli` scaffolds | Starter templates emitted to **end-user projects that have no Tailwind configured** — inline styles are intentional. |
| All **git submodules** (plugins, `packages/capabilities/canvas`, `packages/extensions/components`) | Excluded entirely — submodule edits need in-submodule commits and trip the auto-commit hook under the user's identity. The `packages/capabilities/canvas` `style={{ x, y, rotate, width }}` props are **react-konva node attributes, not CSS**. |

To apply a vetted subset, run with `--apply` over the specific glob.

## Revert

Originals are backed up under `.codemod-backups/inline-style-to-tailwind/<path>`
(gitignored). Restore with `cp`, or `git checkout -- <file>`.
