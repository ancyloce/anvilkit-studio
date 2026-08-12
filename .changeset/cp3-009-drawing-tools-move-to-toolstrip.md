---
"@anvilkit/canvas-editor": minor
---

**BREAKING (UI + published surface):** the drawing tools now live only in the
floating tool strip, and `ElementsPanelProps.tools` is removed (ADR 0008
decision 4, owner sign-off 2026-08-07; PLAN-0035 §5 P3 `cp3-009`). This is the
second half of the restructuring `cp3-003` announced.

**What moved.** `<ElementsPanel>`'s deprecated drawing-tool grid is gone. All
14 built-in tools — `select`, `text`, `rich-text`, `frame`, `rect`, `ellipse`,
`polygon`, `star`, `line`, `path`, `image`, `hand`, `ai-image`, `ai-brush` —
render in `<ToolStrip>`'s rail, which `<CanvasWorkspace>` has mounted over the
canvas all along (`toolStrip` defaults to `true`). Both surfaces already
resolved the *same* effective registry, so nothing became unreachable at any
point during the move.

**No keyboard shortcut changed.** Tool shortcuts are owned by the workspace
shortcut registry (`tool-<id>` bindings), never by the surface that renders the
button: `V`/`T`/`F`/`R`/`O`/`L`/`P`/`I`/`H` are exactly what
[docs/shortcut-reference.md](https://github.com/ancyloce/anvilkit-studio/blob/main/packages/capabilities/canvas/editor/docs/shortcut-reference.md)
already documented.

**Removed.**

- `ElementsPanelProps.tools` — it only ever governed the deleted tool grid and
  was marked `@deprecated` in the previous release. Replacement:
  `<CanvasWorkspace toolStrip={{ items }} />`.

**Regression, stated deliberately — extension tools lose their first-class
surface.** The Elements panel rendered built-ins and extension-registered tools
in ONE flat grid. The tool strip's rail renders built-ins only
(`descriptors.filter((d) => d.builtin)`) and pushes every extension tool into
its **"More tools" overflow menu**. Extension tools stay fully reachable and
keep their `label`/`labelKey`/`icon`/`shortcut`/`disabled` metadata — the
overflow honours the `disabled` probe, which the old grid never did — but they
stop being visible at a glance. That is a real discoverability loss for
extension authors, not an oversight.

**Mitigation, available today:** promote the tool into the rail with

```tsx
<CanvasWorkspace toolStrip={{ items: ["my-ext-tool", "select", "rect"] }} />
```

A promoted extension tool leaves the overflow; built-ins you omit are hidden.
`toolStrip={{ renderer }}` replaces the strip's rendering entirely (the
workspace still positions the cluster) if you want your own arrangement.

**Also lost with the grid:** the Tab Panel's search box no longer filters tools
by localized label — it searches the element catalog now. The tool strip has no
search of its own; the letter shortcuts are the fast path.

**Gating is unchanged.** `image` is still gated on picker availability
(`hasImagePicker`), which since the zero-config asset fallback means it is
*enabled* on a bare mount and disabled only when `disableLocalAssetFallback` is
set with no host adapter. `ai-image`/`ai-brush` are ungated built-ins that show
a busy spinner while an AI job is pending, exactly as before.

**Migration.**

| Before | After |
| --- | --- |
| `<ElementsPanel tools={…} />` | `<CanvasWorkspace toolStrip={{ items }} />` |
| Open the Elements panel to reach a tool | Nothing to open — the strip is always mounted |
| `getByTestId("elements-tool-<id>")` | `getByTestId("tool-strip-<id>")` |
| An extension tool in the panel grid | `getByTestId("tool-strip-more-<id>")` under "More tools" |

Removed i18n keys (`en`/`zh`/`ja`/`ko`): `canvas.elements.drawingTools`,
`canvas.elements.noMatch` — both belonged to the deleted grid.
