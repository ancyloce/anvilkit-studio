# `@anvilkit/vitest-config`

Shared Vitest presets used across the anvilkit-studio workspace.

This package ships two presets and one setup file:

| Export | Purpose |
|---|---|
| `@anvilkit/vitest-config/react-library` | For packages that render React components. Uses `jsdom`, registers `@testing-library/jest-dom` matchers, enables CSS handling. |
| `@anvilkit/vitest-config/node` | For pure Node packages (no DOM, no React). Used by `@anvilkit/utils` and the headless `src/runtime/` of `@anvilkit/core`. |
| `@anvilkit/vitest-config/setup/jest-dom` | Setup file that the `react-library` preset wires into `setupFiles`. Consumers do not import it directly. |

## Usage

Each preset is a `ViteUserConfig` object. Consumers merge it into their own config with `mergeConfig` from `vitest/config`:

```ts
// packages/<pkg>/vitest.config.ts
import { defineConfig, mergeConfig } from "vitest/config";
import { reactLibraryPreset } from "@anvilkit/vitest-config/react-library";

export default mergeConfig(
  reactLibraryPreset,
  defineConfig({
    test: {
      name: "@anvilkit/<pkg>",
    },
  }),
);
```

For a Node-only package:

```ts
// packages/utils/vitest.config.ts
import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@anvilkit/vitest-config/node";

export default mergeConfig(
  nodePreset,
  defineConfig({
    test: {
      name: "@anvilkit/utils",
    },
  }),
);
```

## Peer dependencies

The presets reference `vitest`, `jsdom`, and `@testing-library/jest-dom` but do not bundle them. Consumers (or the workspace root) must install:

- `vitest` ^4.1.0
- `@vitest/coverage-v8` ^4.1.0 (optional, only if `--coverage` is used)
- `jsdom` ^29.0.0 (only required by the `react-library` preset)
- `@testing-library/jest-dom` ^6.9.0 (only required by the `react-library` preset)

For React component tests, consumers also install `@testing-library/react`, `@testing-library/dom`, and `@testing-library/user-event` directly.
