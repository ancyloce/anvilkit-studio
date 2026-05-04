/**
 * @file `image` module placeholder (Phase B / D2).
 *
 * The real implementation lands in D5–D6 (filter strip, search,
 * upload + drop zone, asset grid/cards/rows, overflow menu, plugin
 * `StudioAssetSource` integration).
 */

import { type ReactNode } from "react";

import { useMsg } from "../../../state/editor-i18n-store.js";

export function ImageModule(): ReactNode {
	const msg = useMsg();
	return (
		<div
			data-testid="ak-module-image"
			className="p-4 text-sm text-[var(--ak-studio-muted-fg)]"
		>
			{msg("studio.module.image.name")} — D5/D6 placeholder.
		</div>
	);
}
