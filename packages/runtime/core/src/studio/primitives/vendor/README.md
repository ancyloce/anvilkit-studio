# `studio/primitives/vendor/` — vendored UI code

Third-party-derived primitive code that is **installed/generated, not
hand-authored**. Fenced off here (Next.js `compiled/` pattern) so it is
visually distinct from the package's own primitives one level up in
`studio/primitives/`.

## `animate-ui/`

Vendored from the [animate-ui](https://animate-ui.com) component set via the
shadcn-style installer, then normalized by
`packages/runtime/core/scripts/migrate-shadcn-paths.mjs` (eslint→biome translation,
`verbatimModuleSyntax` fixups, relocation into this tree).

**Do not hand-edit for style.** Its internal layout (`components/`,
`primitives/{animate,base,effects,texts}/`) is kept **verbatim** so the set
can be re-vendored/upgraded without a manual merge. Reached via the
`@/primitives/vendor/animate-ui/*` alias. To change normalization rules, edit
`scripts/migrate-shadcn-paths.mjs` and re-run it, don't patch files here.

### License

Vendored from [`animate-ui/animate-ui`](https://github.com/animate-ui/animate-ui).
The upstream license is **MIT + Commons Clause License Condition** (©&nbsp;2025
Elliot Sutton) — _not_ plain MIT. Its verbatim text is kept alongside the code at
[`./animate-ui/LICENSE`](./animate-ui/LICENSE); the sibling
`lib/get-strict-context.tsx` is from the same upstream and is covered by it too.

The MIT grant requires the copyright + permission notice to ship "in all copies
or substantial portions of the Software", which is why that `LICENSE` file lives
next to the vendored sources. **Note the Commons Clause:** it forbids selling or
redistributing the components "in their original form—whether alone or in a
bundle." Because these files are vendored verbatim, weigh that restriction before
republishing this set on its own. (The current `@anvilkit/core` package ships only
`dist/` + `i18n/` per its `files` field, so this `src/` notice does not reach the
published tarball — track that gap if/when the redistribution stance is settled.)
