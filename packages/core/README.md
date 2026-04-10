# @anvilkit/core

The Anvilkit Studio runtime — a thin, plugin-driven React shell
around [Puck](https://puckeditor.com/) that lets host apps ship a
visual page editor with export formats, AI generation, and custom
header actions added by installable plugins rather than forked code.

`@anvilkit/core` owns the plugin contract, the layered config system,
the lifecycle event bus, the Zustand state slices for Studio-level
concerns (exports, AI, theme), and the `<Studio>` component that
wires all of them to `<Puck>`. Everything above that — component
packages, export plugins, AI plugins — lives in its own `@anvilkit/*`
package and is wired in via the plugin API.

## Install

```bash
pnpm add @anvilkit/core react react-dom @puckeditor/core
```

`react`, `react-dom`, and `@puckeditor/core` are **peer** dependencies
— `@anvilkit/core` will not ship its own copies. Any `react` >=18
and `@puckeditor/core` >=0.21 work.

## Quickstart

```tsx
import { Studio } from "@anvilkit/core";
import type { Config as PuckConfig } from "@puckeditor/core";

const puckConfig: PuckConfig = {
  components: {
    Heading: {
      fields: { text: { type: "text" } },
      defaultProps: { text: "Hello" },
      render: ({ text }) => <h1>{text}</h1>,
    },
  },
};

export default function EditorPage() {
  return (
    <Studio
      puckConfig={puckConfig}
      plugins={[]}
      onPublish={async (data) => {
        await fetch("/api/publish", {
          method: "POST",
          body: JSON.stringify(data),
        });
      }}
    />
  );
}
```

`<Studio>` renders `null` while it resolves the plugin graph, then
mounts `<Puck>` with the compiled runtime. No spinner by default —
render your own loading UI above `<Studio>` if you want one.

## Authoring a StudioPlugin

A plugin is any object whose `register()` returns a
`StudioPluginRegistration`. Every field on the registration is
optional — return `onDataChange` to observe edits, add a
`headerActions` entry to drop a button into the editor header, or
supply `exportFormats` to populate `useExportStore.availableFormats`.

```tsx
import type { StudioPlugin } from "@anvilkit/core";

export function createAutosavePlugin(endpoint: string): StudioPlugin {
  return {
    meta: {
      id: "com.example.autosave",
      name: "Autosave",
      version: "1.0.0",
      coreVersion: "^0.1.0-alpha",
    },
    register() {
      return {
        meta: {
          id: "com.example.autosave",
          name: "Autosave",
          version: "1.0.0",
          coreVersion: "^0.1.0-alpha",
        },
        hooks: {
          onDataChange: async (ctx, data) => {
            ctx.log("debug", "autosaving", { size: JSON.stringify(data).length });
            await fetch(endpoint, {
              method: "POST",
              body: JSON.stringify(data),
            });
          },
        },
        headerActions: [
          {
            id: "com.example.autosave.status",
            label: "Saved",
            group: "secondary",
            onClick: () => {
              // no-op — purely informational
            },
          },
        ],
      };
    },
  };
}
```

Mount it just like any other plugin:

```tsx
<Studio
  puckConfig={puckConfig}
  plugins={[createAutosavePlugin("/api/draft")]}
/>
```

## Config overrides

`<Studio>` accepts a `config` prop that is deep-merged into the
default `StudioConfig` shape before the runtime starts:

```tsx
<Studio
  puckConfig={puckConfig}
  config={{
    features: {
      enableExport: true,
      enableAi: false,
    },
  }}
  plugins={[]}
/>
```

You can also build the config object yourself via
`createStudioConfig()` and read it from descendants with
`useStudioConfig()`. Both live at the `@anvilkit/core/config` subpath
if you want to strip the React layer out of a non-UI consumer.

## Migrating from `aiHost`

The legacy `aiHost` string prop is still supported through a compat
shim for the 0.1 alpha line, but it prints a one-shot deprecation
warning and is scheduled for removal in 0.2.

```tsx
// Before — still works, prints a deprecation warning:
<Studio puckConfig={puckConfig} aiHost="https://ai.example.com" />;

// After — once @anvilkit/plugins/ai-generation ships in Phase 3:
import { createAiGenerationPlugin } from "@anvilkit/plugins/ai-generation";
<Studio
  puckConfig={puckConfig}
  plugins={[createAiGenerationPlugin({ baseUrl: "https://ai.example.com" })]}
/>;
```

The compat adapter lives at `@anvilkit/core/compat` and is never
re-exported from the main barrel. Host apps that never pass `aiHost`
ship zero adapter bytes — the `check:bundle-budget` gate in
`core-015` verifies this is the case on every build.

## Exports map

| Import                     | Purpose                                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| `@anvilkit/core`           | Main barrel. Re-exports types, runtime, config, react (sans `compat`).   |
| `@anvilkit/core/types`     | Plugin contract and domain types (AI, export, IR, config).               |
| `@anvilkit/core/runtime`   | React-free plugin engine (`compilePlugins`, errors, lifecycle manager).  |
| `@anvilkit/core/config`    | `createStudioConfig`, `StudioConfigSchema`, provider + hook.             |
| `@anvilkit/core/react`     | `<Studio>`, `useStudio`, `mergeOverrides`, and the Zustand store hooks.  |
| `@anvilkit/core/compat`    | Legacy compat adapters (`aiHostAdapter`). Tree-shaken unless imported.   |

The `./runtime` subpath is guaranteed React-free — it can be imported
from server-only code or a CLI without pulling React into your
bundle. The `check:react-free-runtime` gate enforces that constraint
on every build.
