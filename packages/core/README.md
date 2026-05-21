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

`<Studio>` wraps `<Puck>`, which is a client-only component. On any
RSC-capable framework (Next.js App Router, Remix, etc.) the page or
component that mounts `<Studio>` must opt into a client boundary —
otherwise the bundler resolves `@puckeditor/core` through its
`react-server` export condition, which does not expose `Puck`, and
you'll see `Attempted import error: 'Puck' is not exported from
'@puckeditor/core'`.

```tsx
"use client";

import { Studio } from "@anvilkit/core";
import "@anvilkit/core/styles.css";
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

If you'd rather keep the route as a Server Component, split the
client surface into its own file and import it from the server:

```tsx
// app/editor/editor-shell.tsx
"use client";

import { Studio } from "@anvilkit/core";
import "@anvilkit/core/styles.css";
import { editorPuckConfig } from "./puck-config";

export function EditorShell() {
  return <Studio puckConfig={editorPuckConfig} plugins={[]} />;
}
```

```tsx
// app/editor/page.tsx — Server Component
import { EditorShell } from "./editor-shell";

export default function EditorPage() {
  return <EditorShell />;
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
      coreVersion: "^0.1.4",
    },
    register() {
      return {
        meta: {
          id: "com.example.autosave",
          name: "Autosave",
          version: "1.0.0",
          coreVersion: "^0.1.4",
        },
        hooks: {
          onDataChange: async (ctx, data) => {
            ctx.log("debug", "autosaving", {
              size: JSON.stringify(data).length,
            });
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

> **Hoist heavy selectors.** `useStudioConfig(selector)` and the
> Zustand store hooks (`useExportStore`, `useThemeStore`, `useAiStore`)
> re-run their selector on every render — the config is static so this
> is cheap, but a selector that does non-trivial work (deep mapping,
> array allocation, JSON walk) should be **hoisted to module scope**
> rather than declared inline. Inline selectors create a new function
> identity on every render, which can re-run the selector against
> identical inputs:
>
> ```tsx
> // Avoid — new selector identity every render:
> const features = useStudioConfig((cfg) => cfg.features);
>
> // Prefer — hoisted, stable identity:
> const selectFeatures = (cfg: StudioConfig) => cfg.features;
> const features = useStudioConfig(selectFeatures);
> ```
>
> Light selectors (one property access) are fine inline — the
> guidance only kicks in when the selector body would be expensive
> to repeat.

## Reading Studio state

The three Studio-level Zustand stores expose per-instance state to
any descendant of `<Studio>`. Each hook accepts an optional selector
and follows the same hoist-the-selector guidance shown above.

```tsx
"use client";

import {
  useAiStore,
  useExportStore,
  useThemeStore,
} from "@anvilkit/core";

const selectLastExport = (s: ReturnType<typeof useExportStore>) =>
  s.lastExport;

export function ExportStatusBadge() {
  const lastExport = useExportStore(selectLastExport);
  const theme = useThemeStore((s) => s.resolved);
  const isGenerating = useAiStore((s) => s.isGenerating);

  if (isGenerating) return <span>Generating…</span>;
  if (!lastExport) return null;
  return (
    <span data-theme={theme}>
      Last export: {lastExport.format} · {lastExport.at}
    </span>
  );
}
```

`useStudio()` projects the compiled plugin runtime (header actions,
export formats, lifecycle manager) for chrome components that need
to compose contributions across plugins:

```tsx
"use client";

import { useStudio } from "@anvilkit/core";

export function HeaderActions() {
  const { runtime } = useStudio();
  return (
    <div className="flex gap-2">
      {runtime.headerActions.map((action) => (
        <button key={action.id} onClick={action.onClick}>
          {action.label}
        </button>
      ))}
    </div>
  );
}
```

## Migrating from `aiHost`

The legacy `aiHost` string prop is still supported through a compat
shim for the 0.1 alpha line, but it prints a one-shot deprecation
warning and is scheduled for removal in 0.2.

```tsx
// Before — still works, prints a deprecation warning:
<Studio puckConfig={puckConfig} aiHost="https://ai.example.com" />;

// After — wire AI generation through @anvilkit/plugin-ai-copilot:
import { createAiCopilotPlugin } from "@anvilkit/plugin-ai-copilot";
<Studio
  puckConfig={puckConfig}
  plugins={[createAiCopilotPlugin({ generatePage: yourGeneratePageFn })]}
/>;
```

The compat adapter lives at `@anvilkit/core/compat` and is never
re-exported from the main barrel. Host apps that never pass `aiHost`
ship zero adapter bytes — a bundle-budget gate verifies this is the
case on every build.

## Exports map

| Import                   | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `@anvilkit/core`         | Main barrel. Re-exports types, runtime, config, react (sans `compat`).  |
| `@anvilkit/core/types`   | Plugin contract and domain types (AI, export, IR, config).              |
| `@anvilkit/core/runtime` | React-free plugin engine (`compilePlugins`, errors, lifecycle manager). |
| `@anvilkit/core/config`  | `createStudioConfig`, `StudioConfigSchema`, provider + hook.            |
| `@anvilkit/core/react`   | `<Studio>`, `useStudio`, `mergeOverrides`, and the Zustand store hooks. |
| `@anvilkit/core/compat`  | Legacy compat adapters (`aiHostAdapter`). Tree-shaken unless imported.  |

The `./runtime` subpath is guaranteed React-free — it can be imported
from server-only code or a CLI without pulling React into your
bundle. The `check:react-free-runtime` gate enforces that constraint
on every build.
