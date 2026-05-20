/**
 * @file Demo wiring plugin — surfaces `@anvilkit/plugin-ai-copilot` in
 * the StudioSidebar's `copilot` module.
 *
 * Core stays agnostic about any specific AI plugin; this small plugin
 * registers the panel body (`<AiCopilotPanel>` from the plugin's
 * `./react` subpath plus the simulate-selection toggle the M9 E2E spec
 * relies on) via `ctx.registerCopilotPanel`, closing over the host's
 * `AiCopilotPluginInstance` so the registered React component can call
 * the plugin's imperative methods directly.
 */

import type { StudioPlugin, StudioPluginMeta } from "@anvilkit/core";
import type {
  StudioCopilotPanel,
  StudioPluginContext,
  StudioSidebarUnregister,
} from "@anvilkit/core/types";
import type { AiCopilotPluginInstance } from "@anvilkit/plugin-ai-copilot";
import { AiCopilotPanel } from "@anvilkit/plugin-ai-copilot/react";
import { Ripple } from "@anvilkit/ui";
import { Button as MotionButton } from "@anvilkit/ui/components/animate-ui/primitives/buttons/button";
import type { AiPromptPanelSelection } from "@anvilkit/ui";
import type { ReactElement } from "react";
import { useState } from "react";

interface CopilotSidebarPluginOptions {
  readonly aiCopilotPlugin: AiCopilotPluginInstance;
}

interface CopilotSidebarPanelProps extends CopilotSidebarPluginOptions {
  /**
   * Live Puck-data accessor. The "Simulate hero selection" toggle must
   * pin the id of whatever Hero is *currently* on the canvas — after a
   * page generation that id is `hero-fallback` / `hero-1` / etc., not
   * the seeded `hero-primary`. Hardcoding the seeded id made
   * regenerate-selection throw `APPLY_FAILED` once the canvas had been
   * regenerated. Throws before the plugin's `onInit` runs;
   * {@link resolveHeroNodeId} treats that as "fall back to the seeded
   * id".
   */
  readonly getData: () => ReturnType<StudioPluginContext["getData"]>;
}

const HERO_TYPE = "Hero";
const FALLBACK_HERO_ID = "hero-primary";

/**
 * Resolve the id of the first Hero component on the live canvas so the
 * simulated section selection always targets a node that actually
 * exists. Falls back to the seeded demo id when data isn't available
 * yet or no Hero is present.
 */
function resolveHeroNodeId(
  getData: CopilotSidebarPanelProps["getData"],
): string {
  let data: ReturnType<StudioPluginContext["getData"]>;
  try {
    data = getData();
  } catch {
    return FALLBACK_HERO_ID;
  }
  const content = (data?.content ?? []) as ReadonlyArray<{
    type?: string;
    props?: { id?: unknown };
  }>;
  for (const item of content) {
    if (item.type === HERO_TYPE && typeof item.props?.id === "string") {
      return item.props.id;
    }
  }
  return FALLBACK_HERO_ID;
}

const meta: StudioPluginMeta = {
  id: "anvilkit-demo-copilot-sidebar",
  name: "Demo Copilot Sidebar",
  version: "0.0.1",
  coreVersion: "^0.1.0-alpha",
  description:
    "Registers the AI copilot prompt panel with the StudioSidebar `copilot` module.",
};

function CopilotSidebarPanel({
  aiCopilotPlugin,
  getData,
}: CopilotSidebarPanelProps): ReactElement {
  const [selectionActive, setSelectionActive] = useState(false);

  const selection: AiPromptPanelSelection | null = selectionActive
    ? {
        zoneId: "root-zone",
        nodeIds: [resolveHeroNodeId(getData)],
        nodeLabels: ["Hero"],
      }
    : null;

  return (
    <div className="flex h-full flex-col gap-3">
      <MotionButton asChild hoverScale={1.02} tapScale={0.97}>
        <button
          type="button"
          data-testid="ai-toggle-section"
          aria-pressed={selectionActive}
          onClick={() => setSelectionActive((prev) => !prev)}
          className="relative self-start overflow-hidden rounded-md border border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] px-3 py-1.5 text-xs font-medium text-[var(--ak-studio-fg)] hover:bg-[var(--ak-studio-border)]"
        >
          <span className="relative z-10">
            {selectionActive
              ? "Clear hero selection"
              : "Simulate hero selection"}
          </span>
          {selectionActive ? (
            <Ripple
              mainCircleSize={60}
              mainCircleOpacity={0.18}
              numCircles={3}
              className="opacity-40"
            />
          ) : null}
        </button>
      </MotionButton>
      {/* model id is informational only — the plugin does not yet route generation by model */}
      <AiCopilotPanel
        plugin={aiCopilotPlugin}
        selection={selection}
        brandName="Pagix Ai Copilot"
        models={[
          { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
          { id: "claude-opus-4-7", label: "Opus 4.7" },
        ]}
        defaultModelId="claude-sonnet-4-6"
      />
    </div>
  );
}

export function createCopilotSidebarPlugin(
  options: CopilotSidebarPluginOptions,
): StudioPlugin {
  let ctxRef: StudioPluginContext | null = null;
  const getLiveData = (): ReturnType<StudioPluginContext["getData"]> => {
    if (!ctxRef) {
      throw new Error("copilot-sidebar-plugin: getData before onInit");
    }
    return ctxRef.getData();
  };
  const panel: StudioCopilotPanel = {
    render: () => (
      <CopilotSidebarPanel
        aiCopilotPlugin={options.aiCopilotPlugin}
        getData={getLiveData}
      />
    ),
  };

  return {
    meta,
    register() {
      let unregister: StudioSidebarUnregister | null = null;
      return {
        meta,
        hooks: {
          onInit: (ctx) => {
            ctxRef = ctx;
            unregister = ctx.registerCopilotPanel?.(panel) ?? null;
          },
          onDestroy: () => {
            unregister?.();
            unregister = null;
            ctxRef = null;
          },
        },
      };
    },
  };
}
