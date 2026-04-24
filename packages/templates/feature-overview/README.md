# @anvilkit/template-feature-overview

Product feature overview page.

Navbar, hero, bento feature grid, statistics, and FAQ — suited to the `/features` subpage of a product site.

![Feature Overview preview](./preview.png)

## Install

```sh
npx anvilkit init --template feature-overview my-site
```

## Composition

This template composes the following component packages:

- `@anvilkit/bento-grid`
- `@anvilkit/helps`
- `@anvilkit/hero`
- `@anvilkit/navbar`
- `@anvilkit/statistics`

## Editing

The canonical `PageIR` tree is committed at `src/page-ir.json`. The
package's default export bundles that IR with the manifest fields
(slug, name, description, preview, package list) into an
`AnvilkitTemplate`.

See `docs/decisions/003-core-templates-subpath.md` for the
`AnvilkitTemplate` contract.
