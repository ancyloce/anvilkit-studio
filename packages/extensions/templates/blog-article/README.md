# @anvilkit/template-blog-article

A single blog-article page.

Navbar, article section with rich prose, and a related-posts CTA button at the foot.

![Blog Article preview](./preview.png)

## Install

```sh
npx anvilkit init --template blog-article my-site
```

## Composition

This template composes the following component packages:

- `@anvilkit/button`
- `@anvilkit/navbar`
- `@anvilkit/section`

## Editing

The canonical `PageIR` tree is committed at `src/page-ir.json`. The
package's default export bundles that IR with the manifest fields
(slug, name, description, preview, package list) into an
`AnvilkitTemplate`.

See `docs/decisions/003-core-templates-subpath.md` for the
`AnvilkitTemplate` contract.
