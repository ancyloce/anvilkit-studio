# @anvilkit/template-blog-index

A blog landing / index page.

Navbar, section heading, and a paginated post list.

![Blog Index preview](./preview.png)

## Install

```sh
npx anvilkit init --template blog-index my-site
```

## Composition

This template composes the following component packages:

- `@anvilkit/blog-list`
- `@anvilkit/navbar`
- `@anvilkit/section`

## Editing

The canonical `PageIR` tree is committed at `src/page-ir.json`. The
package's default export bundles that IR with the manifest fields
(slug, name, description, preview, package list) into an
`AnvilkitTemplate`.

See `docs/decisions/003-core-templates-subpath.md` for the
`AnvilkitTemplate` contract.
