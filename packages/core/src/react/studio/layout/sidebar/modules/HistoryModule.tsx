/**
 * @file `history` module body — Version History.
 *
 * Reads the host-registered `StudioHistoryPanel` from the per-instance
 * sidebar registry and renders its `render()` thunk inside the panel
 * body. When no panel is registered the module shows the
 * `studio.module.history.empty` empty state, mirroring how the
 * `copilot` module handles a missing `StudioCopilotPanel`.
 *
 * `@anvilkit/core` stays agnostic about any specific snapshot store:
 * hosts (or an integration package paired with
 * `@anvilkit/plugin-version-history`) own the React state, adapter
 * reference, and restore-dispatch wiring behind the registered render
 * thunk.
 */

import { History as HistoryIcon } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/layout/sidebar/shared/EmptyState";
import { useMsg } from "@/state/editor-i18n-store";
import { useSidebarRegistry } from "@/state/sidebar-registry-store-react";

export function HistoryModule(): ReactNode {
  const msg = useMsg();
  const panel = useSidebarRegistry((state) => state.historyPanel);

  if (panel === null) {
    return (
      <div data-testid="ak-module-history" className="flex h-full flex-col">
        <EmptyState
          testId="ak-history-empty"
          message={msg("studio.module.history.empty")}
          icon={<HistoryIcon aria-hidden="true" />}
        />
      </div>
    );
  }

  return (
    <div data-testid="ak-module-history" className="flex h-full flex-col p-2">
      {panel.render()}
    </div>
  );
}
