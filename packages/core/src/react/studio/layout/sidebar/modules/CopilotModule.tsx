/**
 * @file `copilot` module body — AI Copilot.
 *
 * Reads the host-registered `StudioCopilotPanel` from the per-instance
 * sidebar registry and renders its `render()` thunk inside the panel
 * body. When no panel is registered the module shows the
 * `studio.module.copilot.empty` empty state, mirroring how the `image`
 * module handles a missing `StudioAssetSource`.
 *
 * `@anvilkit/core` stays agnostic about any specific AI plugin: hosts
 * (or an integration package paired with `@anvilkit/plugin-ai-copilot`)
 * own the React state, plugin reference, and prompt UI behind the
 * registered render thunk.
 */

import { Sparkles as SparklesIcon } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/layout/sidebar/shared/EmptyState";
import { useMsg } from "@/state/editor-i18n-store";
import { useSidebarRegistry } from "@/state/sidebar-registry-store-react";

export function CopilotModule(): ReactNode {
  const msg = useMsg();
  const panel = useSidebarRegistry((state) => state.copilotPanel);

  if (panel === null) {
    return (
      <div data-testid="ak-module-copilot" className="flex h-full flex-col">
        <EmptyState
          testId="ak-copilot-empty"
          message={msg("studio.module.copilot.empty")}
          icon={<SparklesIcon aria-hidden="true" />}
        />
      </div>
    );
  }

  return (
    <div data-testid="ak-module-copilot" className="flex h-full flex-col">
      {panel.render()}
    </div>
  );
}
