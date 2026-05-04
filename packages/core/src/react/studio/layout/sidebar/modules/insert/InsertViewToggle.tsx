/**
 * @file Grid / list view toggle for the `insert` module (PRD §5.4).
 *
 * Two-item segmented control rendered into the panel header via
 * {@link SidebarHeaderActionsContext}. Persists the choice through the
 * `componentViewMode` slice so reloads remember the author's pick.
 */

import { LayoutGrid, List } from "lucide-react";
import type { ReactNode } from "react";

import { ToggleGroup } from "../../../../primitives/ToggleGroup.js";
import { Tooltip } from "../../../../primitives/Tooltip.js";
import { useMsg } from "../../../../state/editor-i18n-store.js";
import { useComponentViewMode } from "../../../../state/hooks.js";
import type { ComponentViewMode } from "../../../../state/editor-ui-store.js";

export function InsertViewToggle(): ReactNode {
	const msg = useMsg();
	const [mode, setMode] = useComponentViewMode();

	const handleChange = (next: readonly ComponentViewMode[]): void => {
		const value = next[0];
		if (value === undefined) return;
		setMode(value);
	};

	return (
		<ToggleGroup.Root<ComponentViewMode>
			value={[mode]}
			onValueChange={handleChange}
			aria-label={msg("studio.module.insert.view.grid")}
		>
			<Tooltip content={msg("studio.module.insert.view.grid")} side="bottom">
				<ToggleGroup.Item<ComponentViewMode>
					value="grid"
					size="sm"
					aria-label={msg("studio.module.insert.view.grid")}
				>
					<LayoutGrid size={14} aria-hidden="true" />
				</ToggleGroup.Item>
			</Tooltip>
			<Tooltip content={msg("studio.module.insert.view.list")} side="bottom">
				<ToggleGroup.Item<ComponentViewMode>
					value="list"
					size="sm"
					aria-label={msg("studio.module.insert.view.list")}
				>
					<List size={14} aria-hidden="true" />
				</ToggleGroup.Item>
			</Tooltip>
		</ToggleGroup.Root>
	);
}
