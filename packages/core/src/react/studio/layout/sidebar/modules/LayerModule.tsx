/**
 * @file `layer` module — Pages & Layers workspace (PRD §6).
 *
 * Stacks `<PagesPanel />` over `<LayersPanel />` in the compact outline
 * layout. Pages keeps its natural height and Layers consumes the
 * remaining panel space, matching the reference Pages / Layers display.
 */

import { type ReactNode } from "react";
import { LayersPanel } from "./layer/LayersPanel";
import { PagesPanel } from "./layer/PagesPanel";

export function LayerModule(): ReactNode {
  return (
    <div
      data-testid="ak-module-layer"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
    >
      <PagesPanel />
      <LayersPanel />
    </div>
  );
}
