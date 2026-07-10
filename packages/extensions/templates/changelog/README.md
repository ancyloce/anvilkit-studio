# @anvilkit/template-changelog

A product changelog page.

Navbar, section heading, and a blog-list re-used as the changelog entry stream.

![Changelog preview](./preview.png)

## Install

```sh
npx anvilkit init --template changelog my-site
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
