# `src/studio/` — the AnvilKit chrome application

This directory is the **internal chrome application** that `<Studio>` mounts
when `chrome="anvilkit"`. It was promoted out of `react/studio/` to a
first-class top-level domain so the package's structure reflects reality:
`react/` is the thin public **shell**, `studio/` is the large private
**chrome app** it renders.

**Not part of the public API.** Nothing here is exported through
`package.json#exports`; consumers reach it only transitively by rendering
`<Studio>`. The single public symbol that physically lives here,
`StudioLoadingScreen`, is re-exported by `src/react/index.ts`.

Reached internally via the `@/studio`, `@/layout`, `@/primitives`,
`@/canvas-drop`, `@/context`, `@/theme`, and `@/ui` aliases.

## Sub-areas

| Dir | Responsibility |
|---|---|
| `layout/` | The editor chrome shell — header, toolbar, sidebar, viewport, and the sidebar feature modules (`sidebar/modules/{image,insert,layer,text}`). |
| `primitives/` | The internal UI primitive library (shadcn/base-ui wrappers) + the vendored `animate-ui` set. Internal-only barrel. |
| `canvas-drop/` | Drag-and-drop handling for the canvas. |
| `context/` | Chrome-facing React contexts (plugin context, pages source, chrome props). |
| `theme/` | Theme sync + iframe theming. |
| `ui/` | Puck UI merge + viewport presets. |

Per-`<Studio>` **state** does not live here — it lives in `src/state/`
(imported via `@/state`).
