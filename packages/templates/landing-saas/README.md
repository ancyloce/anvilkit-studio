# @anvilkit/template-landing-saas

A conversion-focused SaaS landing page.

Navbar, hero, logo cloud, bento feature grid, pricing, statistics, and FAQ — the full set for a typical SaaS home page.

![Landing — SaaS preview](./preview.png)

## Install

```sh
npx anvilkit init --template landing-saas my-site
```

## Composition

This template composes the following component packages:

- `@anvilkit/bento-grid`
- `@anvilkit/helps`
- `@anvilkit/hero`
- `@anvilkit/logo-clouds`
- `@anvilkit/navbar`
- `@anvilkit/pricing-minimal`
- `@anvilkit/statistics`

## Editing

The canonical `PageIR` tree is committed at `src/page-ir.json`. The
package's default export bundles that IR with the manifest fields
(slug, name, description, preview, package list) into an
`AnvilkitTemplate`.

See `docs/decisions/003-core-templates-subpath.md` for the
`AnvilkitTemplate` contract.
