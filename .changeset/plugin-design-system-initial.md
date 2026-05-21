---
"@anvilkit/plugin-design-system": minor
---

Initial v0.1.0 release of `@anvilkit/plugin-design-system` — token-bound fields,
a sidebar Design System panel, and lifecycle validators wired through the
`<Studio>` plugin contract.

The factory `createDesignSystemPlugin({ tokens?, validation? })` registers a
`<TokenProvider>` over Puck's sidebar field tree (via `overrides.fields`), a
two-tab rail panel (Tokens · Theme) through `ctx.registerDesignSystemPanel?`,
a non-blocking off-token warning hook on `onDataChange`, and a WCAG-AA contrast
gate on `onBeforePublish`. Three field factories
(`createTokenColorField` / `createTokenSpacingField` /
`createTokenTypographyField`) return Puck `CustomField<string>` shapes that
store serializable token refs (`color.brand.500`, `space.4`, `text.lg`,
`semantic.bg`). Bundled defaults emit `--ak-ds-*` CSS variables already wired
into `@anvilkit/core`'s host doc + iframe theme.
