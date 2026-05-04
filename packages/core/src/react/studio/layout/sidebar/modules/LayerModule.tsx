/**
 * @file `layer` module placeholder (Phase B / D2).
 *
 * The real implementation lands in D4 (Pages sub-panel + AddPage
 * dialog + Layers sub-panel hosting `<Puck.Outline />` + splitter).
 */

import { type ReactNode } from "react";

import { useMsg } from "../../../state/editor-i18n-store.js";

export function LayerModule(): ReactNode {
	const msg = useMsg();
	return (
		<div
			data-testid="ak-module-layer"
			className="p-4 text-sm text-[var(--ak-studio-muted-fg)]"
		>
			{msg("studio.module.layer.name")} — D4 placeholder.
		</div>
	);
}
