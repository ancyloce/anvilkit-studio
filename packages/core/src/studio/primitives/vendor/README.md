# `studio/primitives/vendor/` — vendored UI code

Third-party-derived primitive code that is **installed/generated, not
hand-authored**. Fenced off here (Next.js `compiled/` pattern) so it is
visually distinct from the package's own primitives one level up in
`studio/primitives/`.

## `animate-ui/`

Vendored from the [animate-ui](https://animate-ui.com) component set via the
shadcn-style installer, then normalized by
`packages/core/scripts/migrate-shadcn-paths.mjs` (eslint→biome translation,
`verbatimModuleSyntax` fixups, relocation into this tree).

**Do not hand-edit for style.** Its internal layout (`components/`,
`primitives/{animate,base,effects,texts}/`) is kept **verbatim** so the set
can be re-vendored/upgraded without a manual merge. Reached via the
`@/primitives/vendor/animate-ui/*` alias. To change normalization rules, edit
`scripts/migrate-shadcn-paths.mjs` and re-run it, don't patch files here.
