/**
 * @file `layer` module — Pages & Layers workspace (PRD §6).
 *
 * Stacks `<PagesPanel />` over `<LayersPanel />` inside a CSS Grid
 * whose row template is driven by `useLayerSplitRatio()`. The middle
 * `<Splitter />` row is a thin drag handle (4 px) that updates the
 * ratio. `minmax(96px, …fr)` clamps each half so the splitter cannot
 * collapse either pane below the minimum-readable size called out in
 * PRD §6.6.
 */

import { type ReactNode } from "react";

import { useLayerSplitRatio } from "../../../state/hooks.js";
import { Splitter } from "../shared/Splitter.js";
import { LayersPanel } from "./layer/LayersPanel.js";
import { PagesPanel } from "./layer/PagesPanel.js";

export function LayerModule(): ReactNode {
	const [ratio] = useLayerSplitRatio();
	return (
		<div
			data-testid="ak-module-layer"
			className="grid h-full min-h-0 w-full"
			style={{
				gridTemplateRows: `minmax(96px, ${ratio}fr) auto minmax(96px, ${1 - ratio}fr)`,
			}}
		>
			<PagesPanel />
			<Splitter />
			<LayersPanel />
		</div>
	);
}
