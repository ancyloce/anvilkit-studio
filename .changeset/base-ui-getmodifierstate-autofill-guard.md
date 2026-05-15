---
"@anvilkit/ui": patch
"@anvilkit/core": patch
---

Fix `TypeError: e.getModifierState is not a function` crash on browser form
autofill. base-ui's Composite root (`Menu`, `Menubar`, `DropdownMenu`,
`NavigationMenu`, `Toggle`, …) calls `event.getModifierState(key)` with no
guard; Chrome/Edge autofill dispatches a `keydown` lacking that method, which
crashed the app. Patched all base-ui packages in the dependency tree
(`@base-ui/react@1.3.0`, `@base-ui/react@1.4.1`,
`@base-ui-components/react@1.0.0-rc.0`) via pnpm `patchedDependencies` to guard
the call (`typeof event.getModifierState === 'function' && …`), matching the
fix shipped by VSCode/monaco for the same browser behavior.
