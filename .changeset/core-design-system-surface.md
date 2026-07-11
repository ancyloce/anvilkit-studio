---
"@anvilkit/core": minor
---

Add the additive core surface that lets `@anvilkit/plugin-design-system`
contribute a design-system rail panel and `--ak-ds-*` token vocabulary
to hosts that install the plugin. Source-compatible — hosts that don't
load the plugin see no behavioural change.

**Plugin context — new optional callback:**

- `StudioPluginContext.registerDesignSystemPanel?(panel)` mirrors the
  existing `registerCopilotPanel?` / `registerHistoryPanel?` shape:
  single-occupancy, last-write-wins, idempotent unregister, no
  panel UI rendered until a plugin registers one. Returns a
  `StudioSidebarUnregister` for cleanup in `onDestroy`.

**Sidebar registry store — new slot:**

- `sidebarRegistryStore.designSystemPanel: StudioDesignSystemPanel | null`
  with matching `registerDesignSystemPanel(panel)` setter (matches
  the copilot/history pattern; capture-and-clear-only-if-still-current).

**Token CSS plumbing — new `--ak-ds-*` two-tier block:**

- `packages/runtime/core/src/react/overrides/styles.css` declares
  primitive ramps (`--ak-ds-brand-{50…900}`,
  `--ak-ds-neutral-{50…900}`), spacing scale
  (`--ak-ds-space-{0,1,2,3,4,6,8,12,16,24}`), type ramp
  (`--ak-ds-text-{xs,sm,base,lg,xl,2xl,3xl}`), radius scale, plus
  semantic vars (`--ak-ds-bg`, `--ak-ds-surface`, `--ak-ds-fg`,
  `--ak-ds-fg-muted`, `--ak-ds-accent`, `--ak-ds-accent-fg`,
  `--ak-ds-border`, `--ak-ds-focus-ring`). Each semantic falls back
  to its `--ak-studio-*` chrome equivalent so unthemed hosts render
  unchanged.
- `packages/runtime/core/src/react/studio/theme/iframe-theme.ts` mirrors the
  same declarations into `TOKEN_BLOCK` so host doc + Puck canvas
  iframe stay in lockstep on theme changes.
- `.dark` overrides primitives only — semantics and persisted token
  refs are theme-stable.

**Type re-exports:**

- `StudioDesignSystemPanel` from `@anvilkit/core/types` parallels
  `StudioCopilotPanel` / `StudioHistoryPanel`.

**No behavioural change for hosts that don't install the plugin.**
The new optional context callback, sidebar-registry slot, and CSS
variables are purely additive. Existing `--ak-studio-*` chrome
vocabulary is untouched.

**Known gap:** the rail tab + sidebar module that _renders_
`sidebarRegistryStore.designSystemPanel` has not yet landed — a
follow-up will add `"design-system"` to `EditorTab` and the
`RAIL_MODULES` table so the panel is reachable from the UI.
Registering a panel today populates state that no UI consumes; the
plugin's other contributions (`--ak-ds-*` CSS, token-bound field
factories, validators) work independently of the rail panel.
