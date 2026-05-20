/**
 * @file Demo wiring plugin pair — surfaces `@anvilkit/plugin-version-history`
 * in the StudioSidebar's `history` module while sharing one
 * `SnapshotAdapter` with the plugin's header-action save flow.
 *
 * The single factory `createDemoVersionHistoryPlugins` returns:
 *   - `versionHistoryPlugin` — the headless plugin that contributes
 *     header actions and emits `version-history:save-requested` /
 *     `version-history:open-requested` events.
 *   - `sidebarPlugin` — a thin demo-side adapter that registers a
 *     `StudioHistoryPanel` rendering `<VersionHistoryUI>`.
 *   - `adapter` — the shared `SnapshotAdapter` instance.
 *
 * Mirrors `apps/demo/lib/copilot-sidebar-plugin.tsx` for shape, and
 * follows the "consolidate integration surface, not packages" pattern
 * (one factory in the demo, rather than splitting into multiple
 * exports).
 *
 * Reactivity: the panel reads current Puck data through `createUsePuck()`
 * resolved against the demo's `@puckeditor/core` copy — the same
 * workaround `collab-studio-plugin.tsx` uses to dodge the dual-puck
 * issue when a plugin submodule pulls in its own peer-dep copy.
 */

import type { StudioPlugin, StudioPluginMeta } from "@anvilkit/core";
import type {
  StudioHistoryPanel,
  StudioSidebarUnregister,
} from "@anvilkit/core/types";
import { irToPuckData, puckDataToIR } from "@anvilkit/ir";
import {
  createVersionHistoryPlugin,
  localStorageAdapter,
  type SnapshotAdapter,
} from "@anvilkit/plugin-version-history";
import { VersionHistoryUI } from "@anvilkit/plugin-version-history/ui";
import { createUsePuck, type Config, type Data } from "@puckeditor/core";
import { type ReactElement, useMemo } from "react";

const useStudioPuck = createUsePuck();

export interface CreateDemoVersionHistoryPluginsOptions {
  readonly puckConfig: Config;
  readonly adapter?: SnapshotAdapter;
  readonly namespace?: string;
  readonly maxSnapshots?: number;
}

export interface DemoVersionHistoryPlugins {
  readonly versionHistoryPlugin: StudioPlugin;
  readonly sidebarPlugin: StudioPlugin;
  readonly adapter: SnapshotAdapter;
}

const META: StudioPluginMeta = {
  id: "anvilkit-demo-history-sidebar",
  name: "Demo Version History Sidebar",
  version: "0.0.1",
  coreVersion: "^0.1.0-alpha",
  description:
    "Registers @anvilkit/plugin-version-history's UI with the StudioSidebar `history` module.",
};

interface HistorySidebarPanelProps {
  readonly adapter: SnapshotAdapter;
  readonly puckConfig: Config;
}

function HistorySidebarPanel({
  adapter,
  puckConfig,
}: HistorySidebarPanelProps): ReactElement {
  const data = useStudioPuck((s) => s.appState.data) as Data;
  const dispatch = useStudioPuck((s) => s.dispatch);

  const currentIR = useMemo(
    () => puckDataToIR(data, puckConfig),
    [data, puckConfig],
  );

  return (
    <div data-testid="ak-history-panel" className="flex flex-col gap-3">
      <VersionHistoryUI
        adapter={adapter}
        currentIR={currentIR}
        onRestore={(ir) => {
          dispatch({ type: "setData", data: irToPuckData(ir) });
        }}
      />
    </div>
  );
}

export function createDemoVersionHistoryPlugins(
  options: CreateDemoVersionHistoryPluginsOptions,
): DemoVersionHistoryPlugins {
  const adapter =
    options.adapter ??
    localStorageAdapter({
      namespace: options.namespace ?? "anvilkit-demo-version-history",
    });

  const versionHistoryPlugin = createVersionHistoryPlugin({
    adapter,
    maxSnapshots: options.maxSnapshots ?? 50,
  });

  const panel: StudioHistoryPanel = {
    render: () => (
      <HistorySidebarPanel adapter={adapter} puckConfig={options.puckConfig} />
    ),
  };

  const sidebarPlugin: StudioPlugin = {
    meta: META,
    register() {
      let unregister: StudioSidebarUnregister | null = null;
      return {
        meta: META,
        hooks: {
          onInit: (ctx) => {
            unregister = ctx.registerHistoryPanel?.(panel) ?? null;
          },
          onDestroy: () => {
            unregister?.();
            unregister = null;
          },
        },
      };
    },
  };

  return { versionHistoryPlugin, sidebarPlugin, adapter };
}
