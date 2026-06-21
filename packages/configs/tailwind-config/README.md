# @anvilkit/tailwind-config

Shared Tailwind CSS 4 tokens and PostCSS config for the
anvilkit-studio workspace. Private — not published to npm.

## Exports

| Import                              | Purpose                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `@anvilkit/tailwind-config`         | `theme.css` — the base token layer (light + dark CSS variables).                              |
| `@anvilkit/tailwind-config/shadcn`  | `shadcn.css` — app-level token layer plus shadcn-style design tokens; pulls Tailwind preflight and workspace-wide `@source` scans. Import once per app. |
| `@anvilkit/tailwind-config/component` | `component.css` — preflight-free, source-scoped base for individual `@anvilkit/*` component packages. Import from a component's `src/styles.css` instead of `/shadcn`. |
| `@anvilkit/tailwind-config/postcss` | PostCSS config bundling `@tailwindcss/postcss`. Drop-in for `apps/demo` and `apps/docs`.      |

## Usage

```css
/* app/globals.css */
@import "@anvilkit/tailwind-config/shadcn";
```

Tailwind 4 is configured CSS-first — there is no `tailwind.config.js`
in this workspace. Override tokens by re-declaring the CSS variables
at your root scope (typically `:root` and `.dark`).

## Peer expectations

Consumers should install `tailwindcss` and `@tailwindcss/postcss`
themselves (or rely on the workspace root's hoisted copy). Pin the
same major Tailwind version as this package (`4.x`).
