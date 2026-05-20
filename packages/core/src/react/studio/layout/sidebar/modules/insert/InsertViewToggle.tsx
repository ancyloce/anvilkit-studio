/**
 * @file Grid / list view toggle for the `insert` module (PRD §5.4).
 *
 * Two-item segmented control rendered into the panel header via
 * {@link SidebarHeaderActionsContext}. Persists the choice through the
 * `componentViewMode` slice so reloads remember the author's pick.
 */

import { LayoutGrid, List } from "lucide-react";
import type { ReactNode } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/primitives/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-store";
import type { ComponentViewMode } from "@/state/editor-ui-store";
import { useComponentViewMode } from "@/state/hooks";

export function InsertViewToggle(): ReactNode {
  const msg = useMsg();
  const [mode, setMode] = useComponentViewMode();

  const handleChange = (next: readonly string[]): void => {
    const value = next[0] as ComponentViewMode | undefined;
    if (value === undefined) return;
    setMode(value);
  };

  return (
    <ToggleGroup
      variant="outline"
      value={[mode]}
      onValueChange={handleChange}
      aria-label={msg("studio.module.insert.view.grid")}
      size="sm"
    >
      <ToggleGroupItem
        value="grid"
        aria-label={msg("studio.module.insert.view.grid")}
      >
        <LayoutGrid aria-hidden="true" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="list"
        aria-label={msg("studio.module.insert.view.list")}
      >
        <List aria-hidden="true" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
