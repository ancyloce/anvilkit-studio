---
"@anvilkit/canvas-editor": minor
---

**BREAKING (UI + published surface):** `<ElementsPanel>` is now a content
browser over an element catalog, not a drawing-tool filter (ADR 0008 decision 4,
owner sign-off 2026-08-07; PLAN-0035 §5 P3 `cp3-003`).

The panel previously mapped the drawing-**tool** registry to buttons and
filtered them by localized label. There was no shape library, no icon set, no
graphics — a bare editor offered tools and nothing to insert. It now renders a
category tab strip, a paginated result grid of thumbnails, and loading / empty /
error states, all fed by the same `search(query) → { entries, nextCursor }`
protocol the Templates panel speaks.

**Added to the public surface.**

- `ElementsPanelProps.elementProvider?: CanvasElementProvider` — the catalog
  seam. Defaults to the built-in ~425-entry catalog (icons, shapes, lines,
  frames, stickers), which is **fetched on the panel's first query, never at
  editor mount**: it sits behind a dynamic `import()` and contributes no
  geometry to the eager editor chunk. A host that supplies its own provider
  never constructs the default one, so its chunk is never requested.
- `ElementsPanelProps.onSelect?: (entry) => void` — activation (click, Enter,
  Space). Insertion itself lands in `cp3-004`; until then the grid browses.
- `CanvasElementEntry`, `CanvasElementCategory`, `CANVAS_ELEMENT_CATEGORIES`,
  `CanvasElementPreview`, `CanvasElementRecolor`, `CanvasElementNode`,
  `CanvasElementBuildContext`, `CanvasElementProvider`,
  `CanvasElementSearchQuery`, `CanvasElementSearchResult`,
  `createStaticElementProvider`, `createLazyElementProvider`,
  `createDefaultElementProvider` — all re-exported from the package root so a
  host can author or serve its own catalog. Additive.

**Deprecated, not repurposed.** `ElementsPanelProps.tools` still means exactly
what it always meant — "render these drawing tools instead of the effective
registry" — and it still governs the drawing-tool grid alone. It has **not**
been given a new meaning for element content; use `elementProvider` for that.
It is marked `@deprecated` and is removed together with the tool grid in
`cp3-009`.

**The drawing tools have not moved yet.** They remain in this panel, below the
content browser, as an explicitly deprecated section with unchanged behaviour
and unchanged `elements-tool-<id>` test ids. `<ToolStrip>` already renders the
identical effective tool registry and is already mounted by `<CanvasWorkspace>`,
so no tool is unreachable at any point. `cp3-009` deletes the section and
updates the specs that drive it in one change.

**Coming in `cp3-009`, stated here because it is a real regression for
extension authors.** Once the panel's tool grid is gone, extension-registered
tools lose their first-class surface: the `<ToolStrip>` rail renders built-ins
only and pushes extension tools into its "More tools" overflow menu. They stay
reachable, but they stop being visible at a glance. **Mitigation, available
today:** promote an extension tool into the rail with
`<CanvasWorkspace toolStrip={{ items }}>`.

**Migration.**

| Before | After |
| --- | --- |
| `<ElementsPanel tools={…} />` to control the tool list | `<CanvasWorkspace toolStrip={{ items }} />` |
| Panel used as a tool picker in tests (`elements-tool-<id>`) | `tool-strip-<id>`, or `tool-strip-more-<id>` for extension tools (`cp3-009`) |
| Nothing to insert | `<ElementsPanel onSelect={…} />`, optionally with `elementProvider` |

New i18n keys (`en`/`zh`/`ja`/`ko`): `canvas.elements.categoriesLabel`,
`categoryAll`, `categoryShape`, `categoryIcon`, `categoryLine`, `categoryFrame`,
`categorySticker`, `gridLabel`, `noResults`, `loadError`, `retry`, `loadMore`,
`loading`.
