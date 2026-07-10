# @anvilkit/template-about

An about / mission page.

Navbar, hero, mission section, statistics, and a customer logo cloud.

![About preview](./preview.png)

## Install

```sh
npx anvilkit init --template about my-site
```

## Composition

This template composes the following component packages:

- `@anvilkit/hero`
- `@anvilkit/logo-clouds`
- `@anvilkit/navbar`
- `@anvilkit/section`
- `@anvilkit/statistics`

## Editing

The canonical `PageIR` tree is committed at `src/page-ir.json`. The
package's default export bundles that IR with the manifest fields
(slug, name, description, preview, package list) into an
`AnvilkitTemplate`.

See `docs/decisions/003-core-templates-subpath.md` for the
`AnvilkitTemplate` contract.
