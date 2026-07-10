# @anvilkit/template-landing-docs

Landing page for a developer-tool docs site.

Navbar, hero, feature section, and FAQ — tuned for a developer audience who want the punchline fast.

![Landing — Docs / Dev-tool preview](./preview.png)

## Install

```sh
npx anvilkit init --template landing-docs my-site
```

## Composition

This template composes the following component packages:

- `@anvilkit/helps`
- `@anvilkit/hero`
- `@anvilkit/navbar`
- `@anvilkit/section`

## Editing

The canonical `PageIR` tree is committed at `src/page-ir.json`. The
package's default export bundles that IR with the manifest fields
(slug, name, description, preview, package list) into an
`AnvilkitTemplate`.

See `docs/decisions/003-core-templates-subpath.md` for the
`AnvilkitTemplate` contract.
