# @anvilkit/ui

## 1.0.0

## 0.1.3

### Patch Changes

- 2438917: Fix `TypeError: e.getModifierState is not a function` crash on browser form
  autofill. base-ui's Composite root (`Menu`, `Menubar`, `DropdownMenu`,
  `NavigationMenu`, `Toggle`, …) calls `event.getModifierState(key)` with no
  guard; Chrome/Edge autofill dispatches a `keydown` lacking that method, which
  crashed the app. Patched all base-ui packages in the dependency tree
  (`@base-ui/react@1.3.0`, `@base-ui/react@1.4.1`,
  `@base-ui-components/react@1.0.0-rc.0`) via pnpm `patchedDependencies` to guard
  the call (`typeof event.getModifierState === 'function' && …`), matching the
  fix shipped by VSCode/monaco for the same browser behavior.

## 0.1.2

## 0.1.1

### Patch Changes

- Routine `0.1.1` patch — coordinated fixed-group bump.

  Aligns the lockstep fixed group at `0.1.1`. Additive only; no breaking
  changes. New surface area in this cut:
  - Section-level AI regeneration (`regenerateSelection`) via
    `@anvilkit/plugin-ai-copilot`, with a reusable `<AiPromptPanel>` in
    `@anvilkit/ui`.
  - `PageIRNode.meta` (locked / owner / notes / version) with diff/apply
    parity across `@anvilkit/ir`, `@anvilkit/schema`, `@anvilkit/validator`,
    and `@anvilkit/plugin-version-history`.
  - Realtime collab integration points (host plugins remain alpha).
  - Marketplace registry feed under the docs site.
