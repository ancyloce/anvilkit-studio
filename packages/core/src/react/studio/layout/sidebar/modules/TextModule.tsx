/**
 * @file `text` module placeholder (Phase B / D2).
 *
 * The real implementation lands in D7 (categories, filter strip,
 * search, snippet rows with selection-aware insert, registered copy
 * snippet packs).
 */

import { type ReactNode } from "react";

import { useMsg } from "../../../state/editor-i18n-store.js";

export function TextModule(): ReactNode {
	const msg = useMsg();
	return (
		<div
			data-testid="ak-module-text"
			className="p-4 text-sm text-[var(--ak-studio-muted-fg)]"
		>
			{msg("studio.module.text.name")} — D7 placeholder.
		</div>
	);
}
