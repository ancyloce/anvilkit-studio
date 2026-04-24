# @anvilkit/template-contact

A contact-us page.

Navbar, section with copy, inline email + message inputs, and a submit button. No form handler wired — users hook up their own.

![Contact preview](./preview.png)

## Install

```sh
npx anvilkit init --template contact my-site
```

## Composition

This template composes the following component packages:

- `@anvilkit/button`
- `@anvilkit/input`
- `@anvilkit/navbar`
- `@anvilkit/section`

## Editing

The canonical `PageIR` tree is committed at `src/page-ir.json`. The
package's default export bundles that IR with the manifest fields
(slug, name, description, preview, package list) into an
`AnvilkitTemplate`.

See `docs/decisions/003-core-templates-subpath.md` for the
`AnvilkitTemplate` contract.
