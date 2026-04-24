# @anvilkit/template-pricing-comparison

A standalone pricing page.

Navbar, hero banner, three-tier pricing grid, and a comparison FAQ — drop-in replacement for `/pricing`.

![Pricing Comparison preview](./preview.png)

## Install

```sh
npx anvilkit init --template pricing-comparison my-site
```

## Composition

This template composes the following component packages:

- `@anvilkit/helps`
- `@anvilkit/hero`
- `@anvilkit/navbar`
- `@anvilkit/pricing-minimal`

## Editing

The canonical `PageIR` tree is committed at `src/page-ir.json`. The
package's default export bundles that IR with the manifest fields
(slug, name, description, preview, package list) into an
`AnvilkitTemplate`.

See `docs/decisions/003-core-templates-subpath.md` for the
`AnvilkitTemplate` contract.
