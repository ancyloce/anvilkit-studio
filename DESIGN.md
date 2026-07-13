# AnvilKit Studio — Neutral Aurora Design System (v2)

> A precise neutral editor shell with a restrained iris-blue signal. The interface stays quiet so the canvas, selected component, and publishing actions remain unmistakably dominant.

**Theme:** dark-first application UI with complete light-mode support
**Foundation:** shadcn/ui semantic tokens + Tailwind CSS v4 + Neutral base palette
**Brand layer:** Electric Iris for high-emphasis interaction; Ember Pulse for rare warm emphasis
**Context:** visual page editor — canvas workspace, component tree, property inspector, publishing workflow

*v2 changes: resolved `--brand-soft` conflict, fixed primary-button AA contrast, 48px top bar, canonical oklch notation, added `destructive-foreground` + chart mappings, unified focus rule, merged redundant sections (~40% shorter).*

---

## 1. Core Principles

### 1.1 Semantic tokens first
Components consume semantic tokens (`background`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `sidebar-*`). Never place Neutral scale values directly in reusable components unless creating a documented editor alias.

### 1.2 One primary signal per view
Electric Iris identifies the single most important action or state: Publish button, selected layer, selected canvas component, active rail tool, focused field. Never fill many controls with brand color at once.

### 1.3 Canvas autonomy
Editor theme and rendered-page theme are separate systems. The canvas viewport preserves its configured width when panels open; opening the inspector never changes the page breakpoint; viewport width (px) and zoom (%) are distinct, always-labeled controls.

### 1.4 Density with breathing room
Compact, not cramped. 4px increments only. Control heights: 28px icon-compact · 32px tree rows / toolbar / compact inputs · 36px default inputs & buttons · 40px emphasized primary.

### 1.5 Borders before shadows
Elevation on dark surfaces = surface contrast → 1px borders → subtle inset highlights → shadows only for detached overlays and floating toolbars.

### 1.6 Priority when rules conflict
```text
Editor usability > shadcn semantics > Neutral foundation > brand expression > decoration
```

### 1.7 Final standard
At rest the workspace is quiet: inactive UI recedes into Neutral, the page frame is clearly separated, and only the selected component and Publish carry blue. Hover is neutral; focus is a precise iris ring; selection synchronizes across layers, canvas, and inspector; destructive intent appears only on approach.

---

## 2. Theme Modes

### 2.1 Dark (default)
Shell `neutral-950` family · panels `neutral-900` · elevated controls `neutral-800` · hover/selected `neutral-800/700` · borders translucent white · primary text `neutral-50` · secondary text `neutral-400` · selection Electric Iris.

### 2.2 Light (fully supported)
Shell white/`neutral-50` · panels white · workspace `neutral-100` · borders `neutral-200` · primary text `neutral-900` · secondary text `neutral-500` (white surfaces only — use `neutral-600` on `neutral-100`) · selection Electric Iris.

### 2.3 Marketing
Aurora gradients and the Esbuild display font are allowed **only** on: sign-in/onboarding heroes, empty-project onboarding, release artwork, public landing pages. Never in persistent sidebars, inspector backgrounds, input fills, tree rows, canvas overlays, menus, or dialogs. Marketing headers may use 64px height and pill CTAs.

---

## 3. Color System

### 3.1 Neutral reference scale
| Token | Hex | Primary use |
|---|---:|---|
| `neutral-50` | `#fafafa` | dark-mode foreground, light elevated tint |
| `neutral-100` | `#f5f5f5` | light workspace, light muted surface |
| `neutral-200` | `#e5e5e5` | light borders and input outlines |
| `neutral-300` | `#d4d4d4` | stronger light dividers |
| `neutral-400` | `#a3a3a3` | dark secondary text and icons |
| `neutral-500` | `#737373` | light secondary text (on white only) |
| `neutral-600` | `#525252` | strong muted text, secondary text on neutral-100 |
| `neutral-700` | `#404040` | dark hover/pressed states |
| `neutral-800` | `#262626` | dark elevated controls, secondary fills |
| `neutral-900` | `#171717` | dark panels, cards, popovers |
| `neutral-950` | `#0a0a0a` | dark application shell, canvas backing |

Reference only — components use semantic tokens.

### 3.2 Brand colors
oklch is canonical; hex values are informative equivalents.

| Name | Canonical value | ≈Hex | Token | Role |
|---|---|---:|---|---|
| Electric Iris | `oklch(0.619 0.141 262.4)` | `#5683da` | `--brand` | selection, active state, focus, dark primary fill |
| Iris Deep | `oklch(0.54 0.155 262.4)` | `#3b63c4` | `--brand-deep` | light-mode primary fill (AA with white text) |
| Iris Hover | `oklch(0.675 0.122 263.5)` | `#6f95e2` | `--brand-hover` | primary hover (dark) |
| Iris Pressed | `oklch(0.566 0.135 262.8)` | `#4a73c5` | `--brand-pressed` | primary pressed |
| Iris Soft | `rgb(86 131 218 / 12%)` light · `16%` dark | — | `--brand-soft` | selected rows, subtle emphasis |
| Ember Pulse | `oklch(0.753 0.152 38.1)` | `#ff8964` | `--warm` | rare warm emphasis, marketing accent |
| Ember Soft | `rgb(255 137 100 / 14%)` | — | `--warm-soft` | warm badges, notice surfaces |

**Constraints**
- Electric Iris may serve as `primary`, `ring`, `selection`, `sidebar-primary`.
- **Contrast rule:** white text on `--brand` is 3.5:1 — below AA for body text. Light mode maps `primary` → `--brand-deep` (4.9:1 with white). Dark mode keeps the `--brand` fill with white text for ≥15px/600 labels only; 13px button text uses `--brand-deep` fill or near-black foreground. Non-text uses of `--brand` (outlines, rings, indicators) need only 3:1 and are unrestricted.
- Ember Pulse is never a second primary and never destructive.
- One filled Electric Iris action per normal editor view.
- Use opacity-based soft backgrounds, never hardcoded pale blue.

### 3.3 Semantic token mapping
| Token | Light | Dark | Purpose |
|---|---|---|---|
| `background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | app shell |
| `foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | default text/icons |
| `card` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | panels, inspector groups, dialogs |
| `popover` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | dropdowns, floating surfaces |
| `primary` | `var(--brand-deep)` | `var(--brand)` | brand action, active states |
| `primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.985 0 0)` | text on primary (dark fill: ≥15px/600 only) |
| `secondary` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | secondary controls |
| `muted` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | subtle surfaces |
| `muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` | descriptions, placeholders |
| `accent` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | hover/active neutral surfaces |
| `destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | errors, destructive confirm |
| `destructive-foreground` | `oklch(0.985 0 0)` | `oklch(0.145 0 0)` | text on destructive fill |
| `border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` | dividers, containers |
| `input` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 15%)` | form control outlines |
| `ring` | `var(--brand)` | `var(--brand)` | keyboard focus ring |

### 3.4 Editor aliases
| Token | Light | Dark | Role |
|---|---|---|---|
| `--editor-topbar` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | global header |
| `--editor-panel` | `oklch(1 0 0)` | `oklch(0.178 0 0)` | nav + inspector panels |
| `--editor-panel-raised` | `oklch(0.985 0 0)` | `oklch(0.205 0 0)` | nested panel groups |
| `--editor-workspace` | `oklch(0.97 0 0)` | `oklch(0.205 0 0)` | canvas surround |
| `--editor-canvas-frame` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | fallback behind transparent pages |
| `--editor-selection` | `var(--brand)` | `var(--brand)` | selected component outline |
| `--editor-selection-soft` | `rgb(86 131 218 / 12%)` | `rgb(86 131 218 / 16%)` | selected tree row |
| `--editor-drop-target` | `rgb(86 131 218 / 18%)` | `rgb(86 131 218 / 22%)` | drag destination |
| `--editor-grid` | `rgb(0 0 0 / 5%)` | `rgb(255 255 255 / 5%)` | optional workspace grid (off by default) |
| `--editor-overlay` | `rgb(0 0 0 / 38%)` | `rgb(0 0 0 / 56%)` | modal scrim |

**Canvas-frame rule (dark):** the frame token is darker than the workspace, so separation must come from a 1px `border` and mandatory `--shadow-canvas` — the page's own background paints the frame; the token only backs transparent pages.

---

## 4. Typography

### 4.1 Fonts
**Inter** for all product UI: `--font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Weights: 400 descriptions/placeholders · 500 inputs/rows/buttons/tabs · 600 panel titles/selected/primary · 700 rare app-level emphasis.

**Esbuild** is marketing-only (heroes, campaign artwork, release graphics). Never in toolbars, tree rows, inspectors, dialogs, labels, or canvas overlays.

### 4.2 Editor type scale
| Role | Size / LH | Weight | Usage |
|---|---:|---:|---|
| micro | 10/14 | 500 | canvas measurement labels only |
| caption | 11/16 | 500 | shortcuts, metadata, badges |
| compact | 12/16 | 400–500 | helper text, tree metadata |
| body | 13/20 | 400–500 | default editor text and controls |
| body-lg | 14/20 | 500 | important controls, form values |
| panel-title | 14/20 | 600 | panel headings |
| heading-sm | 16/24 | 600 | dialog + inspector section titles |
| heading | 20/28 | 600 | full-page settings headings |

Rules: default is 13px. Sentence case everywhere; uppercase only for compact status codes. Tabular numerals for zoom, dimensions, measurements. No negative tracking below 16px.

---

## 5. Spacing, Shape, Elevation

### 5.1 Spacing
Base 4px. `--space-1…8` = 4, 8, 12, 16, 20, 24, 32px (micro gap → major layout). No arbitrary values.

### 5.2 Control heights
28px icon-compact · 32px tree row / toolbar control / compact input · 36px default input, button, Publish · **48px top bar and canvas toolbar** (64px reserved for marketing headers).

### 5.3 Radius
`--radius: 0.625rem` (10px). Tree row 6px · input/button/icon button 8px · card/popover/menu 10px · dialog 12px · canvas label 4px · badge/avatar/segmented shell 9999px. Pills only where shape communicates status, identity, segmented choice, compact metadata, or marketing conversion.

### 5.4 Borders & shadows
Default divider `1px solid var(--border)`. Focused inputs keep a stable border and add the ring. Selected tree row = soft brand fill + 1px brand outline. Selected canvas component = 1px Iris outline at all zooms.

| Token | Value | Usage |
|---|---|---|
| `--shadow-overlay` | `0 12px 32px rgb(0 0 0 / 28%)` | dialogs, command palettes |
| `--shadow-popover` | `0 8px 24px rgb(0 0 0 / 22%)` | menus, popovers |
| `--shadow-floating` | `0 4px 16px rgb(0 0 0 / 24%)` | selection toolbar |
| `--shadow-canvas` | `0 8px 28px rgb(0 0 0 / 20%)` | page frame vs workspace (mandatory in dark) |

No heavy shadows on persistent sidebars or inspectors.

---

## 6. Editor Layout

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Global Top Bar (48px)                                                │
├──────┬──────────────────┬─────────────────────────────┬──────────────┤
│ Tool │ Active Panel     │ Canvas Toolbar (48px)       │ Inspector    │
│ Rail │ Pages / Layers   ├─────────────────────────────┤ Properties   │
│ 52px │ / Assets 280–320 │      Canvas Workspace       │ 320–360      │
└──────┴──────────────────┴─────────────────────────────┴──────────────┘
```

Minimum usable canvas viewport 720px; workspace padding 24–32px.

**Panel behavior:** left panel and inspector independently collapsible and resizable (widths persist). Pages/Layers/Assets/Components share one panel, one mode at a time, one scroll area. Inspector title always matches the selection. Focus mode hides both panels, keeps the canvas toolbar.

---

## 7. Component Specifications

### 7.1 Global top bar
`Back | Project / Home … Collaborators · Share | Preview | Publish ▾` — background `--editor-topbar`, bottom border, 48px. Breadcrumb ancestors muted, current page foreground. Only Publish is filled primary; Share is outline/secondary; Preview is ghost with icon+text. Theme/language live in the account menu.

### 7.2 Activity rail
52px wide; 36×36 icon buttons for Pages, Layers, Assets, Components, Text styles, AI tools, History, Search. Active = `bg-sidebar-accent` + brand icon + 2px left indicator. Every icon has a tooltip with name and shortcut.

### 7.3 Navigation panel
Uses `--editor-panel`; sticky header with title, `+`, and a 32px search field. One scroll area per panel; mode persists between sessions.

### 7.4 Page tree
Rows: disclosure (when children) · icon · name · optional route/status · hover context menu. States: hover `bg-sidebar-accent`; selected stronger neutral fill (current page icon may use brand); focus brand ring; drag target `--editor-drop-target` + insertion line; hidden/draft reduced opacity + explicit status icon. Consistent 16px indentation.

### 7.5 Layer tree
`Drag handle | Icon | Name … Visibility | Menu`, 32px rows. Selected = `--editor-selection-soft` + 1px brand outline; selection synchronizes with canvas and inspector; canvas selection expands ancestors and scrolls into view. Row actions on hover but keyboard accessible. Lock/hidden/error use distinct icons, not color alone.

### 7.6 Canvas toolbar
`Desktop ▾ | 1440 px … Undo Redo | Fit | − 100% +`. Device preset + viewport width grouped; zoom is a separate group; never two unlabeled `100%` values. Width in px, zoom in %. Groups use separators, not gaps.

### 7.7 Canvas workspace & selection
Workspace `--editor-workspace`, ≥24px padding; page frame keeps breakpoint width — overflow scrolls the workspace, never compresses the page. Selection: 1px Iris outline, no layout shift; name label (10–11px medium, 4px radius) outside top-left when space allows. Selection toolbar (`Move | Duplicate | More | Delete`) floats outside the boundary, flips near edges, raised neutral surface; Delete is neutral until hover; all actions have tooltips + shortcuts; deletion supports Undo.

### 7.8 Inspector
320–360px; sticky header showing the selected component's real name (never `Root` when Hero is selected); collapsible groups — Content, Actions, Appearance, Layout, Advanced; only the body scrolls; spacing over separators.

### 7.9 Form fields
Labels 12px medium; descriptions 11–12px muted below; required = text/icon, not color. Inputs 36px (32px compact), transparent or slightly elevated fill, `--input` border, placeholder `muted-foreground`, invalid = destructive border + message. Textareas auto-grow for short content; resize handle only for long-form. URL fields accept relative paths, absolute URLs, and page selection via combobox, with validation and an external-link indicator (`https://example.com or /about`). Booleans use a Switch with a direct label — segmented `No/Yes` only when both states must stay visible.

### 7.10 Action collections
Never an indefinitely growing flat field list — use cards per action with `⋮` menu and `[ + Add action ]`:
```ts
interface HeroAction {
  id: string
  platform?: "linux" | "macos" | "windows" | "other"
  label: string
  href: string
  target?: "_self" | "_blank"
  icon?: string
}
```

### 7.11 Buttons
- **Primary:** `primary` fill / `primary-foreground`, 8px radius; hover `--brand-hover`, pressed `--brand-pressed`. One per view (Publish/Save/Confirm).
- **Secondary:** neutral fill (Share, auxiliary actions).
- **Outline:** transparent, `border-input`, hover `accent`.
- **Ghost:** transparent, hover `accent` — default for toolbar/icon actions.
- **Destructive:** semantic token; filled only inside confirmation flows; delete icons neutral until hover.

### 7.12 Tabs & segmented controls
Tabs for in-panel mode switching; the rail when modes carry distinct tool contexts. Segmented controls for device modes, alignment, and binary *visual* options — not default booleans.

### 7.13 Dialogs, popovers, menus, tooltips
Semantic `popover`/`card` tokens, 10–12px radius, border + restrained shadow; 32px menu items; destructive items use destructive text + hover surface; dialogs trap focus, Escape closes unless a destructive operation is in progress. Every unlabeled icon gets a tooltip (`Duplicate ⌘D`): 12px medium, `Kbd`-styled shortcut, **500ms delay (150ms within a sequence)**.

---

## 8. Interaction & Motion

| State | Treatment |
|---|---|
| hover | neutral accent surface — no brand unless already active |
| active/pressed | darker neutral or `--brand-pressed` |
| selected | soft brand surface + brand outline/indicator |
| focus-visible | **2px `ring` at 50% opacity, 2px offset** (`outline-ring/50`) — keyboard only |
| disabled | 50% opacity, readable labels |
| loading | spinner, stable width |
| error | destructive text + icon + field association |
| drag source | 70% opacity + lifted shadow |
| drag target | brand soft fill + insertion indicator |

Motion clarifies state, never atmosphere: hover 100ms · press 80ms · panel collapse 180ms `cubic-bezier(0.2,0.8,0.2,1)` · popover 120ms · dialog 160ms · tree expand 140ms · toolbar reposition 100ms — all ease-out. Respect `prefers-reduced-motion`. Never animate selection borders, gradients, sidebar backgrounds, or focus glows.

---

## 9. Accessibility

- Text and essential icons meet WCAG AA (see §3.2 contrast rule for primary fills).
- Focus visible in both modes; color never the sole indicator for selected/hidden/locked/warning/error.
- All icon-only controls have accessible names; trees use ARIA tree semantics with keyboard navigation; drag-and-drop has keyboard alternatives.
- Minimum pointer target 28×28px dense, 36px primary. Canvas zoom never scales editor chrome or tooltips.

---

## 10. Do and Don't

**Do:** semantic tokens as component API · Neutral for surfaces/borders/muted/hover · Iris for the selected object and single primary action · canvas dominant · one shared left panel · inspector title = selection · viewport width ≠ zoom · Switch for booleans · collapsible inspector groups · Lucide monochrome line icons.

**Don't:** hardcode surface hexes in components · brand blue on every hover · Ember as destructive · Aurora behind persistent panels · universal pills · duplicate unlabeled zoom values · panels silently altering breakpoints · competing scroll areas in one sidebar · shadows as panel separation · Esbuild in product UI · white 13px text on `--brand` fill.

---

## 11. Implementation

### 11.1 `components.json`
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": { "config": "", "css": "app/globals.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "iconLibrary": "lucide",
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" }
}
```

### 11.2 Tailwind v4 theme
```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --font-sans: var(--font-inter);

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);

  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --color-brand: var(--brand);
  --color-brand-deep: var(--brand-deep);
  --color-brand-hover: var(--brand-hover);
  --color-brand-pressed: var(--brand-pressed);
  --color-brand-soft: var(--brand-soft);
  --color-warm: var(--warm);
  --color-warm-soft: var(--warm-soft);

  --color-editor-topbar: var(--editor-topbar);
  --color-editor-panel: var(--editor-panel);
  --color-editor-panel-raised: var(--editor-panel-raised);
  --color-editor-workspace: var(--editor-workspace);
  --color-editor-canvas-frame: var(--editor-canvas-frame);
  --color-editor-selection: var(--editor-selection);
  --color-editor-selection-soft: var(--editor-selection-soft);
  --color-editor-drop-target: var(--editor-drop-target);
  --color-editor-grid: var(--editor-grid);
  --color-editor-overlay: var(--editor-overlay);

  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.2);
  --radius-2xl: calc(var(--radius) * 1.6);
  --radius-3xl: calc(var(--radius) * 2);
}
```

### 11.3 Theme variables
```css
:root {
  --font-inter: "Inter", ui-sans-serif, system-ui, -apple-system,
    BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-esbuild: "Esbuild", "Inter", ui-sans-serif, system-ui, sans-serif;

  --radius: 0.625rem;

  /* Brand */
  --brand: oklch(0.619 0.141 262.4);
  --brand-deep: oklch(0.54 0.155 262.4);
  --brand-hover: oklch(0.675 0.122 263.5);
  --brand-pressed: oklch(0.566 0.135 262.8);
  --brand-soft: rgb(86 131 218 / 12%);
  --warm: oklch(0.753 0.152 38.1);
  --warm-soft: rgb(255 137 100 / 14%);

  /* shadcn Neutral semantic foundation */
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: var(--brand-deep);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: var(--brand);

  /* Charts */
  --chart-1: var(--brand);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: var(--warm);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.556 0 0);

  /* Sidebar */
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: var(--brand-deep);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: var(--brand);

  /* Editor aliases */
  --editor-topbar: oklch(1 0 0);
  --editor-panel: oklch(1 0 0);
  --editor-panel-raised: oklch(0.985 0 0);
  --editor-workspace: oklch(0.97 0 0);
  --editor-canvas-frame: oklch(1 0 0);
  --editor-selection: var(--brand);
  --editor-selection-soft: rgb(86 131 218 / 12%);
  --editor-drop-target: rgb(86 131 218 / 18%);
  --editor-grid: rgb(0 0 0 / 5%);
  --editor-overlay: rgb(0 0 0 / 38%);

  /* Elevation */
  --shadow-overlay: 0 12px 32px rgb(0 0 0 / 28%);
  --shadow-popover: 0 8px 24px rgb(0 0 0 / 22%);
  --shadow-floating: 0 4px 16px rgb(0 0 0 / 24%);
  --shadow-canvas: 0 8px 28px rgb(0 0 0 / 20%);
}

.dark {
  --brand-soft: rgb(86 131 218 / 16%);

  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: var(--brand);
  --primary-foreground: oklch(0.985 0 0); /* ≥15px/600 text only; else use --brand-deep fill */
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.145 0 0);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: var(--brand);

  --sidebar: oklch(0.178 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: var(--brand);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: var(--brand);

  --editor-topbar: oklch(0.145 0 0);
  --editor-panel: oklch(0.178 0 0);
  --editor-panel-raised: oklch(0.205 0 0);
  --editor-workspace: oklch(0.205 0 0);
  --editor-canvas-frame: oklch(0.145 0 0);
  --editor-selection: var(--brand);
  --editor-selection-soft: rgb(86 131 218 / 16%);
  --editor-drop-target: rgb(86 131 218 / 22%);
  --editor-grid: rgb(255 255 255 / 5%);
  --editor-overlay: rgb(0 0 0 / 56%);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  html { font-family: var(--font-sans); }
  body { @apply bg-background text-foreground antialiased; }
}
```

---

## 12. Agent Prompt Guide

> Build a dark-first visual editor using shadcn/ui with `baseColor: neutral`, semantic CSS variables, Tailwind CSS v4, and Lucide icons. Neutral tokens control all application surfaces, borders, inputs, muted text, menus, and hover states. Use Electric Iris `oklch(0.619 0.141 262.4)` only for the single primary action, active navigation, selected layers, canvas outlines, and focus rings; in light mode primary fills use Iris Deep `oklch(0.54 0.155 262.4)` for AA contrast. Use Ember Pulse only for rare warm highlights, never destructive. Editor controls use 8–10px radii; pills only for badges, avatars, and segmented controls. Top bar and canvas toolbar are 48px. Keep the canvas dominant, panels collapsible/resizable, viewport width separate from zoom, selection synchronized across layers/canvas/inspector, and inspector fields grouped into collapsible Content, Actions, Appearance, Layout, Advanced. No gradients, display fonts, or heavy shadows in persistent editor chrome.
