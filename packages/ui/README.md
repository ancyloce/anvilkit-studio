# @anvilkit/ui

Shared UI primitives used by every `@anvilkit/*` component package
and the Studio runtime itself. These are headless, theme-aware
building blocks — `Button`, `Card`, `Dialog`, `Avatar`, dropdown +
menubar primitives, scroll-and-presence layers, and a handful of
motion components used by the marketing surfaces.

## Install

```bash
pnpm add @anvilkit/ui react react-dom
```

`react` and `react-dom` are peer dependencies (`>=19.0.0`). Tailwind is
not a peer dep, but `globals.css` is published for consumers that
want the shadcn-style token layer.

## Usage

```tsx
import { Button } from "@anvilkit/ui/button";
import { Card } from "@anvilkit/ui/card";
import { Avatar } from "@anvilkit/ui/avatar";
```

Import the shared design tokens once at the root of your app:

```css
/* app/globals.css */
@import "@anvilkit/ui/globals.css";
```

The CSS layer uses shadcn-style CSS variables (`--background`,
`--foreground`, `--primary`, …) for light + dark mode. Override any
token at your root scope to retheme every primitive.

## Layout

| Subpath                 | Contents                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `@anvilkit/ui`          | Main barrel — re-exports every primitive.                                                    |
| `@anvilkit/ui/button`   | `Button`, `ButtonGroup`, and the `buttonVariants` cva.                                       |
| `@anvilkit/ui/card`     | `Card`, `CardHeader`, `CardContent`, `CardFooter`.                                           |
| `@anvilkit/ui/dialog`   | Base-UI dialog wired with the Anvilkit token layer.                                          |
| `@anvilkit/ui/presence` | Peer avatars, presence overlays, and cursor primitives used by `@anvilkit/plugin-collab-ui`. |
| `@anvilkit/ui/hooks/*`  | Stable React hooks (`useMeasure`, etc.) re-exported for downstream packages.                 |
| `@anvilkit/ui/lib/*`    | Internal helpers (`cn`, `cva` builders) — re-exported so component packages share one copy.  |

The package is bundled with Rslib and ships CJS, ESM, and `.d.ts`
types per subpath. `sideEffects` is limited to `*.css` so unused
primitives tree-shake.

## Dependency contract

`@anvilkit/ui` is the **UI leaf** of the workspace — every component
package and most plugins consume it. It must not import any other
`@anvilkit/*` package (no `core`, no `ir`, no `validator`); doing so
would create a cycle.

| Allowed                                                                     | Forbidden                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------- |
| React, Radix Slot, Base-UI, Floating UI, `class-variance-authority`, `clsx` | `@anvilkit/core`, `@anvilkit/ir`, plugin packages |
| `lucide-react`, `motion`, `next-themes`, `tailwind-merge`, `shiki`, `embla` | DOM globals at module-eval time                   |
