# @anvilkit/template-landing-agency

A services-led agency landing page.

Navbar, hero, about section, services grid, social proof stats, and a CTA button.

![Landing — Agency preview](./preview.png)

## Install

```sh
npx anvilkit init --template landing-agency my-site
```

## Composition

This template composes the following component packages:

- `@anvilkit/bento-grid`
- `@anvilkit/button`
- `@anvilkit/hero`
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
