/**
 * @file `insert` module placeholder (Phase B / D2).
 *
 * The real implementation lands in D3 (component sections, search,
 * grid/list view toggle, plugin-contributed sections). For now this
 * just renders the module name so the rail/panel chrome can be
 * exercised end-to-end.
 */

import { type ReactNode } from "react";

import { useMsg } from "../../../state/editor-i18n-store.js";

export function InsertModule(): ReactNode {
	const msg = useMsg();
	return (
		<div
			data-testid="ak-module-insert"
			className="p-4 text-sm text-[var(--ak-studio-muted-fg)]"
		>
			{msg("studio.module.insert.name")} — D3 placeholder.
		</div>
	);
}
