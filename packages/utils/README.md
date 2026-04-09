# @anvilkit/utils

Zero-dependency helpers shared across Anvilkit runtime packages
(`@anvilkit/core`, `@anvilkit/schema`, `@anvilkit/validator`, …).

This package is the **leaf** of the Anvilkit runtime dependency graph —
it must not import any other `@anvilkit/*` package, and it keeps its
`dependencies` field empty so downstream packages pay zero install
cost for these primitives.

## Public API

| Export              | Signature                                                          | Summary                                                                                     |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `generateId`        | `(prefix?: string) => string`                                      | RFC 4122 v4 UUID (via `crypto.randomUUID()`) with optional prefix.                          |
| `deepMerge`         | `<T>(target: T, ...sources: DeepPartial<T>[]) => T`                | Recursive plain-object merge. **Arrays are replaced**, not concatenated.                    |
| `invariant`         | `(condition: unknown, message: string) => asserts condition`       | Throws `Error(message)` when `condition` is falsy; narrows the type for the caller.         |
| `debounce`          | `<T>(fn: T, wait: number) => T & { cancel(): void }`               | Leading-edge-off debounce with a `.cancel()` method to drop a pending call.                 |
| `getStrictContext`  | `<T>(name: string) => [Provider<T>, () => T]`                      | React context + hook pair that throws a descriptive error when used outside its provider.   |

`getStrictContext` is the only helper that touches React, and `react`
is declared as an **optional peer dependency**. Consumers that do not
import `get-strict-context` never need React installed.

## Usage

```ts
import { deepMerge, generateId, invariant } from "@anvilkit/utils";

const pluginId = generateId("plugin");
// => "plugin-0192ac5e-a9b3-7ce0-b4a9-9f4f8a4f5d2b"

const merged = deepMerge(
  { theme: { mode: "light", tokens: { primary: "#000" } } },
  { theme: { mode: "dark" } },
);
// => { theme: { mode: "dark", tokens: { primary: "#000" } } }

invariant(merged.theme.mode === "dark", "theme.mode must be 'dark'");
```

```tsx
import { getStrictContext } from "@anvilkit/utils";

interface StudioConfig {
  apiKey: string;
}

const [StudioConfigProvider, useStudioConfig] =
  getStrictContext<StudioConfig>("StudioConfig");

export { StudioConfigProvider, useStudioConfig };
```

## Scope

This package intentionally does **not** export:

- A `cn` / `classnames` helper — that lives in `@anvilkit/ui`.
- Zustand slice helpers — those belong in `@anvilkit/core/react`.
- A theme sync hook — ditto.

See `docs/tasks/core-002-utils-scaffold.md` for the full rationale.
