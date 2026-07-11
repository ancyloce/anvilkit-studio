# AnvilKit Studio — Neutral Aurora Design System

> A precise neutral editor shell with a restrained iris-blue signal. The interface stays quiet so the canvas, selected component, and publishing actions remain unmistakably dominant.

**Theme:** dark-first application UI with complete light-mode support  
**Foundation:** shadcn/ui semantic tokens + Tailwind CSS v4 + Neutral base palette  
**Brand layer:** Electric Iris for high-emphasis interaction; Ember Pulse for rare warm emphasis  
**Primary product context:** visual page editor, canvas workspace, component tree, property inspector, publishing workflow

---

## 1. Overview

AnvilKit Studio combines the structural discipline of shadcn/ui's Neutral theme with the restrained atmospheric character of the original Huly-inspired system.

The Neutral palette owns the application shell:

- backgrounds and elevated surfaces;
- sidebars, toolbars, inspectors, and overlays;
- borders, separators, inputs, and hover states;
- default text, muted text, and disabled states.

The brand palette is intentionally narrow:

- **Electric Iris** identifies the primary action, selected layer, canvas selection outline, focus ring, and active navigation state;
- **Ember Pulse** is reserved for warm highlights, warnings that are not errors, notification dots, and limited marketing gradients;
- destructive actions use the semantic shadcn destructive token rather than Ember Pulse.

The editor must feel dense, calm, and dependable. Brand effects should never compete with the page being edited.

---

## 2. Design Direction

### 2.1 Product character

The interface should communicate:

- **Precision:** compact controls, consistent alignment, explicit selection states;
- **Neutrality:** the editor chrome does not visually contaminate the user's page design;
- **Depth without decoration:** elevation comes primarily from neutral surface steps and borders;
- **Controlled energy:** blue appears only when an element is active, selected, focused, or primary;
- **Professional density:** optimized for prolonged desktop editing rather than marketing-page comfort.

### 2.2 Integration rule

Use the following priority when design rules conflict:

```text
Editor usability
  > shadcn semantic behavior
    > Neutral visual foundation
      > AnvilKit brand expression
        > decorative effects
```

### 2.3 What changed from the previous design

The previous system was spectacle-first, mixed-theme, and pill-heavy. This updated system is application-first:

- Neutral replaces bespoke graphite colors as the default UI foundation;
- semantic shadcn tokens replace direct color references in components;
- 8–10px radii replace universal pills in dense editor controls;
- pill geometry remains only for badges, segmented controls, avatars, and marketing CTAs;
- Aurora gradients are removed from the persistent editor shell;
- Esbuild is removed from functional UI and retained only for optional marketing display text;
- Pages and Layers are treated as alternate navigation modes, not permanently stacked panels;
- the canvas and inspector receive explicit editor-specific tokens and interaction rules.

---

## 3. Core Principles

### 3.1 Semantic tokens first

Components must consume semantic tokens such as:

```text
background / foreground
card / card-foreground
popover / popover-foreground
primary / primary-foreground
secondary / secondary-foreground
muted / muted-foreground
accent / accent-foreground
destructive
border / input / ring
sidebar-* tokens
```

Do not place Neutral scale values directly inside reusable component classes unless creating a documented editor-specific alias.

### 3.2 One primary signal per view

Electric Iris should identify the most important current action or state. Examples:

- Publish button;
- selected layer;
- selected canvas component;
- active sidebar tool;
- focused form field.

Do not simultaneously fill many controls with the brand color.

### 3.3 Canvas autonomy

The editor theme and the rendered page theme are separate systems.

- The editor may be dark while the page is light.
- The canvas viewport must preserve its configured width even when side panels open.
- Opening the inspector may reduce visible workspace, but must not silently change the page breakpoint.
- Canvas zoom and canvas width are different controls and must never share an ambiguous label.

### 3.4 Density with breathing room

The editor is compact, not cramped.

- 28px: icon-only compact controls;
- 32px: tree rows, toolbar buttons, compact inputs;
- 36px: default inputs and buttons;
- 40px: primary actions when additional emphasis is required.

Use 4px increments and avoid arbitrary spacing values.

### 3.5 Borders before shadows

Dark application surfaces should rely on:

1. surface contrast;
2. 1px neutral borders;
3. subtle inset highlights;
4. shadows only for detached overlays and floating toolbars.

---

## 4. Theme Modes

### 4.1 Dark mode — default editor mode

Use dark mode for the Studio workspace by default.

- Application background: Neutral 950 family;
- panels and bars: Neutral 900 family;
- elevated controls and overlays: Neutral 800 family;
- hover and selected neutral surfaces: Neutral 800/700 family;
- borders: translucent white or Neutral 800;
- primary text: Neutral 50;
- secondary text: Neutral 400;
- brand selection: Electric Iris.

### 4.2 Light mode

Light mode is a fully supported editor theme, not an inverted afterthought.

- Application background: white or Neutral 50;
- panels: white;
- workspace: Neutral 100;
- borders: Neutral 200;
- primary text: Neutral 900;
- secondary text: Neutral 500;
- brand selection: Electric Iris.

### 4.3 Marketing mode

Marketing surfaces may use the original Aurora visual language, but they must be isolated from functional editor chrome.

Allowed locations:

- sign-in and onboarding hero;
- empty project onboarding;
- release announcement artwork;
- public landing pages.

Forbidden locations:

- persistent sidebars;
- property inspector backgrounds;
- input fills;
- tree rows;
- canvas selection overlays;
- menus and dialogs.

---

## 5. Color System

## 5.1 Neutral reference scale

| Token | Hex | Primary use |
|---|---:|---|
| `neutral-50` | `#fafafa` | dark-mode foreground, light elevated tint |
| `neutral-100` | `#f5f5f5` | light workspace, light muted surface |
| `neutral-200` | `#e5e5e5` | light borders and input outlines |
| `neutral-300` | `#d4d4d4` | stronger light dividers |
| `neutral-400` | `#a3a3a3` | dark secondary text and icons |
| `neutral-500` | `#737373` | light secondary text, disabled content |
| `neutral-600` | `#525252` | strong muted text, dark control outlines |
| `neutral-700` | `#404040` | dark hover/pressed states |
| `neutral-800` | `#262626` | dark elevated controls and secondary fills |
| `neutral-900` | `#171717` | dark panels, cards, popovers |
| `neutral-950` | `#0a0a0a` | dark application shell and canvas backing |

The scale is a reference only. Components should use semantic tokens.

## 5.2 Brand colors

| Name | Value | Token | Role |
|---|---:|---|---|
| Electric Iris | `#5683da` | `--brand` | primary action, selection, active state, focus |
| Electric Iris Hover | `#6f95e2` | `--brand-hover` | primary hover on dark surfaces |
| Electric Iris Pressed | `#4a73c5` | `--brand-pressed` | primary pressed state |
| Electric Iris Soft | `rgb(86 131 218 / 14%)` | `--brand-soft` | selected rows and subtle emphasis |
| Ember Pulse | `#ff8964` | `--warm` | rare warm emphasis and marketing accent |
| Ember Pulse Soft | `rgb(255 137 100 / 14%)` | `--warm-soft` | warm badges and notice surfaces |

### Brand usage constraints

- Electric Iris may be used as `primary`, `ring`, `selection`, and `sidebar-primary`.
- Ember Pulse must not become a second primary action color.
- A normal editor view should contain no more than one filled Electric Iris action.
- Use opacity-based soft backgrounds rather than pale blue hardcoded surfaces.

## 5.3 Semantic token mapping

### Light

| Semantic token | Value | Purpose |
|---|---|---|
| `background` | `oklch(1 0 0)` | app shell and panels |
| `foreground` | `oklch(0.145 0 0)` | default text and icons |
| `card` | `oklch(1 0 0)` | inspector groups and dialogs |
| `popover` | `oklch(1 0 0)` | dropdowns and floating surfaces |
| `primary` | `oklch(0.619 0.141 262.4)` | brand action and active states |
| `primary-foreground` | `oklch(0.985 0 0)` | text on primary |
| `secondary` | `oklch(0.97 0 0)` | secondary controls |
| `muted` | `oklch(0.97 0 0)` | subtle surfaces |
| `muted-foreground` | `oklch(0.556 0 0)` | descriptions and placeholders |
| `accent` | `oklch(0.97 0 0)` | hover and active neutral surfaces |
| `border` | `oklch(0.922 0 0)` | dividers and containers |
| `input` | `oklch(0.922 0 0)` | form control outlines |
| `ring` | `oklch(0.619 0.141 262.4)` | keyboard focus ring |

### Dark

| Semantic token | Value | Purpose |
|---|---|---|
| `background` | `oklch(0.145 0 0)` | app shell and deepest workspace |
| `foreground` | `oklch(0.985 0 0)` | default text and icons |
| `card` | `oklch(0.205 0 0)` | side panels and inspector groups |
| `popover` | `oklch(0.205 0 0)` | dropdowns and detached overlays |
| `primary` | `oklch(0.619 0.141 262.4)` | brand action and active states |
| `primary-foreground` | `oklch(0.985 0 0)` | text on primary |
| `secondary` | `oklch(0.269 0 0)` | secondary controls |
| `muted` | `oklch(0.269 0 0)` | subtle surfaces |
| `muted-foreground` | `oklch(0.708 0 0)` | descriptions and placeholders |
| `accent` | `oklch(0.269 0 0)` | hover and active neutral surfaces |
| `border` | `oklch(1 0 0 / 10%)` | dividers and containers |
| `input` | `oklch(1 0 0 / 15%)` | form control outlines |
| `ring` | `oklch(0.619 0.141 262.4)` | keyboard focus ring |

## 5.4 Editor-specific aliases

These aliases clarify roles that are too specific for generic shadcn tokens.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--editor-topbar` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | global header |
| `--editor-panel` | `oklch(1 0 0)` | `oklch(0.178 0 0)` | navigation and inspector panels |
| `--editor-panel-raised` | `oklch(0.985 0 0)` | `oklch(0.205 0 0)` | nested panel groups |
| `--editor-workspace` | `oklch(0.97 0 0)` | `oklch(0.205 0 0)` | canvas outside area |
| `--editor-canvas-frame` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | page frame boundary |
| `--editor-selection` | `oklch(0.619 0.141 262.4)` | same | selected component outline |
| `--editor-selection-soft` | `rgb(86 131 218 / 12%)` | `rgb(86 131 218 / 16%)` | selected tree row |
| `--editor-drop-target` | `rgb(86 131 218 / 18%)` | `rgb(86 131 218 / 22%)` | drag destination |
| `--editor-grid` | `rgb(0 0 0 / 5%)` | `rgb(255 255 255 / 5%)` | optional workspace grid |
| `--editor-overlay` | `rgb(0 0 0 / 38%)` | `rgb(0 0 0 / 56%)` | modal and interaction scrim |

---

## 6. Typography

## 6.1 Functional UI font

### Inter

Use Inter for all product interface text.

```css
--font-sans: "Inter", ui-sans-serif, system-ui, -apple-system,
  BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Recommended weights:

- 400: descriptions, placeholders, secondary text;
- 500: inputs, tree rows, buttons, tabs;
- 600: panel titles, selected items, primary actions;
- 700: rare application-level emphasis only.

## 6.2 Display font

### Esbuild — optional marketing-only font

Esbuild may be used for:

- public landing page hero headings;
- onboarding campaign artwork;
- release announcement graphics.

It must not be used in:

- toolbars;
- tree rows;
- inspectors;
- dialogs;
- form labels;
- canvas control overlays.

## 6.3 Editor type scale

| Role | Size | Line height | Weight | Usage |
|---|---:|---:|---:|---|
| micro | 10px | 14px | 500 | canvas measurement labels only |
| caption | 11px | 16px | 500 | shortcuts, metadata, badges |
| compact | 12px | 16px | 400–500 | helper text, secondary tree metadata |
| body | 13px | 20px | 400–500 | default editor body and controls |
| body-lg | 14px | 20px | 500 | important controls and form values |
| panel-title | 14px | 20px | 600 | Pages, Layers, Hero |
| heading-sm | 16px | 24px | 600 | dialogs and inspector section titles |
| heading | 20px | 28px | 600 | full-page settings headings |

### Typography rules

- Default editor text is 13px, not 14–16px everywhere.
- Use sentence case for labels and buttons.
- Avoid uppercase except for compact status codes and technical metadata.
- Use tabular numerals for zoom percentages, dimensions, and measurements.
- Do not use negative tracking below 16px.

---

## 7. Spacing and Density

**Base unit:** 4px  
**Density:** compact-comfortable

| Token | Value | Typical use |
|---|---:|---|
| `--space-1` | 4px | icon-to-label micro gap |
| `--space-2` | 8px | compact control gap |
| `--space-3` | 12px | standard row padding and field gap |
| `--space-4` | 16px | panel padding and group spacing |
| `--space-5` | 20px | large panel padding |
| `--space-6` | 24px | dialog and card padding |
| `--space-8` | 32px | major layout spacing |

### Control heights

| Control | Height |
|---|---:|
| icon button compact | 28px |
| tree row | 32px |
| toolbar control | 32px |
| input compact | 32px |
| input default | 36px |
| button default | 36px |
| primary publish button | 36px |
| top bar | 64px |
| canvas toolbar | 48px |

---

## 8. Shape System

shadcn's moderate radius becomes the default. The editor should not be universally pill-shaped.

```css
--radius: 0.625rem; /* 10px */
```

| Element | Radius | Rule |
|---|---:|---|
| tree row | 6px | compact and stable |
| input / textarea | 8px | slightly tighter than cards |
| button | 8px | default editor control |
| icon button | 8px | consistent with buttons |
| card / inspector group | 10px | uses base radius |
| popover / menu | 10px | detached surface |
| dialog | 12px | larger elevated container |
| selected canvas label | 4px | technical overlay, not decorative |
| badge / status / avatar | 9999px | pill allowed |
| segmented control | 9999px outer shell | compact grouped choice |
| marketing CTA | 9999px | brand expression outside editor shell |

### Shape rule

Use pills only when the shape communicates one of the following:

- status;
- identity;
- binary or segmented choice;
- compact metadata;
- marketing conversion.

---

## 9. Borders, Shadows, and Elevation

## 9.1 Borders

- Default divider: `1px solid var(--border)`;
- focused input: border remains stable; apply ring rather than changing layout;
- selected tree row: soft brand fill + 1px brand outline;
- selected canvas component: 1px Electric Iris outline at all zoom levels;
- destructive target: semantic destructive outline only during confirmation or active drag.

## 9.2 Shadows

| Token | Value | Usage |
|---|---|---|
| `--shadow-overlay` | `0 12px 32px rgb(0 0 0 / 28%)` | dialogs and command palettes |
| `--shadow-popover` | `0 8px 24px rgb(0 0 0 / 22%)` | menus and popovers |
| `--shadow-floating` | `0 4px 16px rgb(0 0 0 / 24%)` | selection action toolbar |
| `--shadow-canvas` | `0 8px 28px rgb(0 0 0 / 20%)` | page frame against workspace |

Do not apply heavy shadows to persistent sidebars or inspectors.

---

## 10. Editor Layout

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Global Top Bar                                                       │
├──────┬──────────────────┬─────────────────────────────┬──────────────┤
│      │                  │ Canvas Toolbar              │ Inspector    │
│ Tool │ Active Panel     ├─────────────────────────────┤              │
│ Rail │ Pages / Layers   │                             │ Properties   │
│      │ / Assets         │      Canvas Workspace       │              │
│      │                  │                             │              │
└──────┴──────────────────┴─────────────────────────────┴──────────────┘
```

### 10.1 Global dimensions

| Region | Recommended size |
|---|---:|
| top bar | 64px |
| activity rail | 52px |
| left panel | 280–320px, resizable |
| inspector | 320–360px, resizable |
| canvas toolbar | 48px |
| workspace padding | 24–32px |
| minimum usable canvas viewport | 720px |

### 10.2 Panel behavior

- Left panel and Inspector are independently collapsible.
- Pages, Layers, Assets, and Components occupy one shared panel; only one primary mode is visible at a time.
- Inspector title must always match the selected component.
- Opening the Inspector must not change the configured responsive breakpoint.
- A focus mode hides both panels while retaining the canvas toolbar.
- Resizing a panel must preserve the user's last width.

---

## 11. Component Specifications

## 11.1 Global Top Bar

**Role:** project context, collaboration, preview, and publishing.

Recommended structure:

```text
Back | Project / Home                   Collaborators Share | Preview | Publish ▾
```

Rules:

- background: `var(--editor-topbar)`;
- border-bottom: `var(--border)`;
- height: 64px;
- breadcrumb uses muted text for ancestors and foreground for the current page;
- theme and language controls belong in the account/settings menu;
- only Publish uses a filled primary treatment;
- Share uses outline or secondary treatment;
- Preview is a ghost button with icon and text;
- avoid ambiguous labels such as “Open Canvas” while already inside the editor.

## 11.2 Activity Rail

**Role:** switch the active left-panel mode.

Items:

- Pages;
- Layers;
- Assets;
- Components;
- Text styles;
- AI tools;
- History;
- Search.

Rules:

- width: 52px;
- icon button: 36×36px inside the rail;
- active state: `bg-sidebar-accent`, brand icon, and a 2px left indicator;
- every icon requires a tooltip with name and keyboard shortcut;
- do not rely on icon meaning alone.

## 11.3 Navigation Panel

**Role:** display the active Pages, Layers, Assets, or Components mode.

Header:

```text
Layers                                      +
[ Search layers…                              ]
```

Rules:

- panel uses `--editor-panel`;
- header remains sticky;
- search is compact, 32px high;
- avoid nested independent scroll areas inside the same panel;
- one panel body owns vertical scrolling;
- panel mode should persist between sessions.

## 11.4 Page Tree

Tree rows include:

- disclosure icon when children exist;
- page icon;
- page name;
- optional route or status metadata;
- context menu on hover.

States:

| State | Treatment |
|---|---|
| default | transparent, foreground text |
| hover | `bg-sidebar-accent` |
| selected | stronger neutral fill; current page icon may use brand |
| focused | visible brand focus ring |
| drag target | `--editor-drop-target` + insertion line |
| hidden / draft | reduced opacity with explicit status icon |

Hierarchy must use consistent 16px indentation and disclosure controls. Never imply nesting through irregular spacing alone.

## 11.5 Layer Tree

Each row contains:

```text
Drag handle | Component icon | Name                 Visibility | Menu
```

Rules:

- row height: 32px;
- selected row: `--editor-selection-soft` plus 1px brand outline;
- selection must synchronize with the canvas and inspector;
- selecting a canvas component expands ancestor nodes and scrolls the layer into view;
- row actions appear on hover but remain keyboard accessible;
- lock, hidden, and error states must use distinct icons rather than color alone.

## 11.6 Canvas Toolbar

Recommended structure:

```text
Desktop ▾ | 1440 px                           Undo Redo | Fit | − 100% +
```

Rules:

- device preset and viewport width are grouped;
- zoom controls form a separate group;
- do not show two unlabeled `100%` values;
- viewport width uses pixels; zoom uses percentage;
- Undo/Redo buttons expose disabled states and shortcuts;
- toolbar groups use separators, not large empty gaps.

## 11.7 Canvas Workspace

**Role:** neutral environment surrounding the rendered page.

Rules:

- background: `var(--editor-workspace)`;
- page frame: `var(--editor-canvas-frame)`;
- workspace padding: at least 24px;
- show a subtle frame border and optional canvas shadow;
- page frame size is determined by breakpoint width, not remaining center-column width;
- overflow occurs in the workspace rather than compressing the page;
- scrollbars remain low contrast until hover.

Optional grid:

```css
background-image:
  linear-gradient(var(--editor-grid) 1px, transparent 1px),
  linear-gradient(90deg, var(--editor-grid) 1px, transparent 1px);
background-size: 16px 16px;
```

The grid should be disabled by default for page editing.

## 11.8 Canvas Selection

Selected component treatment:

- 1px Electric Iris outline;
- no layout shift;
- component name label placed outside the top-left edge when space allows;
- resize or spacing handles use brand only when interactive;
- the label uses 10–11px medium text and a 4px radius;
- avoid covering the rendered content.

Selection toolbar:

```text
Move | Duplicate | More | Delete
```

- placed outside the selection boundary where possible;
- automatically flips when close to a viewport edge;
- uses a raised neutral surface;
- delete is neutral by default and turns destructive on hover;
- every action includes a tooltip and shortcut;
- deletion must support Undo.

## 11.9 Inspector Panel

Header:

```text
◇ Hero                                      ⋯  Close
Component properties
```

Rules:

- never display `Root` when a specific component such as Hero is selected;
- width: 320–360px;
- header is sticky;
- property groups use collapsible sections;
- only the panel body scrolls;
- groups use spacing rather than separators between every field.

Recommended hierarchy:

```text
Hero
├── Content
│   ├── Announcement
│   ├── Headline
│   └── Description
├── Actions
│   ├── Linux CTA
│   ├── macOS CTA
│   └── Windows CTA
├── Appearance
├── Layout
└── Advanced
```

## 11.10 Form Fields

### Label

- 12px medium;
- foreground or high-contrast muted foreground;
- optional field description appears below in 11–12px muted text;
- required status uses text or icon, not color alone.

### Input

- height: 36px default, 32px compact;
- background: transparent or slightly elevated neutral surface;
- border: `var(--input)`;
- focus: 2px `ring` at 40–50% opacity;
- placeholder: `muted-foreground`;
- invalid: semantic destructive border and message.

### Textarea

- minimum height based on content role;
- auto-grow for short content fields such as headline;
- fixed resize handle only for long-form fields;
- avoid oversized empty textareas.

### URL field

Support:

- relative paths such as `/pricing`;
- absolute URLs;
- page selection through a combobox;
- validation status;
- an optional external-link indicator.

Placeholder:

```text
https://example.com or /about
```

### Boolean field

Use a Switch with a direct label:

```text
Open in new tab                                      [ switch ]
```

Do not use a `No / Yes` segmented control for a simple boolean unless the distinction needs explicit comparison.

## 11.11 Action Collections

Do not model platform actions as an indefinitely growing flat field list.

Preferred structure:

```text
Actions
┌────────────────────────────────────────┐
│ Linux CTA                          ⋮   │
│ Label   Download for Linux             │
│ Link    /download/linux                │
└────────────────────────────────────────┘

[ + Add action ]
```

Suggested data model:

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

## 11.12 Buttons

### Primary

- background: `primary`;
- foreground: `primary-foreground`;
- radius: 8px inside editor;
- used for Publish, Save, Confirm, or the single primary action;
- hover: `--brand-hover`;
- pressed: `--brand-pressed`.

### Secondary

- neutral filled surface;
- used for Share, auxiliary confirmation, and lower-emphasis actions.

### Outline

- transparent background;
- `border-input`;
- hover uses `accent`.

### Ghost

- transparent by default;
- hover uses `accent`;
- preferred for toolbar and icon actions.

### Destructive

- semantic destructive token;
- use a filled variant only inside confirmation flows;
- normal delete icons should remain neutral until hover.

## 11.13 Tabs and Segmented Controls

Use Tabs for Pages/Layers/Assets when displayed within the same panel. Use the activity rail when each mode has a distinct icon and tool context.

Segmented controls are appropriate for:

- responsive device modes;
- alignment choices;
- binary visual options where both states must remain visible.

They are not the default choice for normal booleans.

## 11.14 Dialogs, Popovers, and Menus

- use shadcn semantic `popover` and `card` tokens;
- 10–12px radius;
- border + restrained shadow;
- menu item height: 32px;
- destructive menu item uses destructive text and hover surface;
- dialogs must trap focus and close on Escape unless a destructive operation is in progress;
- command palette uses a stronger overlay shadow but no gradient.

## 11.15 Tooltips

Every unlabeled icon control requires a tooltip.

Format:

```text
Duplicate                                  ⌘D
```

- delay: 400–600ms for normal tools;
- shorter delay after the first tooltip in a sequence;
- tooltip text uses 12px medium;
- shortcut uses `Kbd` styling.

---

## 12. Interaction States

| State | Visual treatment |
|---|---|
| hover | neutral accent surface; no brand unless already active |
| active / pressed | darker neutral or brand pressed token |
| selected | soft brand surface + brand outline or indicator |
| focus-visible | 2px brand ring with offset |
| disabled | 50% opacity; preserve readable labels |
| loading | spinner plus stable button width |
| error | destructive text, icon, and field association |
| drag source | 70% opacity + lifted shadow |
| drag target | brand soft fill + insertion indicator |

### Focus rule

Only show strong focus rings for keyboard focus using `:focus-visible`. Mouse selection may use a selected state without an additional ring.

---

## 13. Motion

Motion should clarify state changes, not create atmosphere.

| Interaction | Duration | Easing |
|---|---:|---|
| hover color | 100ms | ease-out |
| button press | 80ms | ease-out |
| panel collapse | 180ms | cubic-bezier(0.2, 0.8, 0.2, 1) |
| popover enter | 120ms | ease-out |
| dialog enter | 160ms | ease-out |
| tree expand | 140ms | ease-out |
| selection toolbar reposition | 100ms | linear/ease-out |

Respect `prefers-reduced-motion` by removing transforms and reducing duration to near-zero.

Do not animate:

- canvas selection borders continuously;
- persistent gradients;
- sidebar backgrounds;
- input focus with large glows.

---

## 14. Accessibility

- Text and essential icons must meet WCAG AA contrast.
- Focus must remain visible in both dark and light modes.
- Color must not be the only indicator for selected, hidden, locked, warning, or error states.
- All icon-only controls require accessible names.
- Tree views require correct keyboard navigation and ARIA tree semantics.
- Drag-and-drop must have keyboard alternatives.
- Panel resizing must be keyboard accessible where feasible.
- Minimum pointer target is 28×28px in dense desktop contexts; primary controls should reach 36px.
- Canvas zoom must not affect the scale of editor chrome or tooltips.

---

## 15. Do and Don't

### Do

- Use shadcn semantic tokens as the component API.
- Use Neutral for surfaces, borders, muted content, and hover states.
- Use Electric Iris for the selected object and the single primary action.
- Keep the canvas visually dominant.
- Make Pages, Layers, Assets, and Components alternate modes of one panel.
- Keep inspector titles synchronized with the actual selection.
- Separate viewport width from zoom percentage.
- Use Switch for simple booleans.
- Use collapsible property groups for long inspectors.
- Use Lucide-style monochrome line icons.

### Don't

- Do not hardcode `#111111`, `#303236`, or other surface colors inside components.
- Do not use brand blue for every hover state.
- Do not use Ember Pulse as a destructive color.
- Do not place Aurora gradients behind persistent editor panels.
- Do not make every control pill-shaped.
- Do not display duplicate page names or duplicate unlabeled zoom values.
- Do not allow side panels to silently alter responsive breakpoints.
- Do not create multiple competing scroll areas within one sidebar.
- Do not use shadows as the primary method of separating persistent panels.
- Do not use Esbuild in functional product UI.

---

## 16. Quick Color Reference

### Dark editor

- app background: Neutral 950 / `background`;
- panels: Neutral 900-derived / `--editor-panel`;
- raised controls: Neutral 800 / `secondary`, `accent`;
- primary text: Neutral 50 / `foreground`;
- muted text: Neutral 400 / `muted-foreground`;
- borders: white at 10–15% / `border`, `input`;
- selection and primary action: Electric Iris / `primary`;
- warnings and warm notices: Ember Pulse / `--warm`;
- destructive: semantic destructive red.

### Light editor

- app background: white / `background`;
- workspace: Neutral 100 / `--editor-workspace`;
- panels: white / `--editor-panel`;
- primary text: Neutral 900 / `foreground`;
- muted text: Neutral 500 / `muted-foreground`;
- borders: Neutral 200 / `border`, `input`;
- selection and primary action: Electric Iris / `primary`.

---

## 17. Implementation

## 17.1 `components.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-nova",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

## 17.2 Tailwind CSS v4 theme

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

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
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --color-brand: var(--brand);
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

## 17.3 Theme variables

```css
:root {
  --font-inter: "Inter", ui-sans-serif, system-ui, -apple-system,
    BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-esbuild: "Esbuild", "Inter", ui-sans-serif, system-ui, sans-serif;

  --radius: 0.625rem;

  /* Brand */
  --brand: oklch(0.619 0.141 262.4);
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
  --primary: var(--brand);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: var(--brand);

  /* Charts */
  --chart-1: var(--brand);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: var(--warm);
  --chart-4: oklch(0.646 0.222 41.116);
  --chart-5: oklch(0.556 0 0);

  /* Sidebar */
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: var(--brand);
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
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
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
  * {
    @apply border-border outline-ring/50;
  }

  html {
    font-family: var(--font-sans);
  }

  body {
    @apply bg-background text-foreground antialiased;
  }
}
```

## 17.4 Editor utility examples

```tsx
// Selected layer row
<div className="h-8 rounded-md border border-editor-selection bg-editor-selection-soft px-2 text-sm font-medium">
  Hero
</div>

// Canvas workspace
<main className="bg-editor-workspace p-6">
  <div className="bg-editor-canvas-frame shadow-[var(--shadow-canvas)]">
    {/* Rendered page */}
  </div>
</main>

// Inspector field
<div className="grid gap-2">
  <Label htmlFor="headline">Headline</Label>
  <Textarea id="headline" className="min-h-20 resize-none" />
</div>

// Primary publish action
<Button className="bg-brand text-primary-foreground hover:bg-brand-hover active:bg-brand-pressed">
  Publish
</Button>
```

---

## 18. Agent Prompt Guide

Use this condensed instruction when asking an implementation agent to build or revise editor UI:

> Build a dark-first visual editor using shadcn/ui with `baseColor: neutral`, semantic CSS variables, Tailwind CSS v4, and Lucide icons. Neutral tokens must control all application surfaces, borders, inputs, muted text, menus, and hover states. Use Electric Iris `#5683da` only for the single primary action, active navigation, selected layers, canvas outlines, and focus rings. Use Ember Pulse `#ff8964` only for rare warm highlights, never as destructive. Default editor controls use 8–10px radii; reserve full pills for badges, avatars, segmented controls, and marketing CTAs. Keep the canvas dominant, make side panels collapsible and resizable, separate viewport width from zoom, synchronize Layers/Canvas/Inspector selection, and group inspector fields into collapsible Content, Actions, Appearance, Layout, and Advanced sections. Do not use gradients, display fonts, or heavy shadows in persistent editor chrome.

---

## 19. Final Visual Standard

The finished interface should look like a neutral professional tool before it looks like a branded website.

At rest:

- the workspace is quiet;
- inactive UI recedes into Neutral surfaces;
- the page frame is clearly separated from the editor;
- only the selected component and Publish action carry strong blue emphasis.

During interaction:

- hover uses neutral contrast;
- focus uses a precise iris ring;
- selection synchronizes across the layer tree, canvas, and inspector;
- destructive intent appears only when the user approaches a destructive action;
- panels support the task without becoming the visual subject.

The result should feel closer to a disciplined design tool than a dark marketing page: neutral, compact, predictable, and unmistakably responsive to user intent.
