/**
 * @file `text` module filter strip — All / Basic / Brand.
 *
 * Mirrors {@link ../image/ImageFilterStrip.tsx} — single-select
 * segmented control bound to the persisted `copyCategoryFilter` slice
 * (PRD §8.3 / §9.2). Plugin-defined snippet categories do not get
 * their own filter pill in v1: the slice union is locked to
 * `"all" | "basic" | "brand"`. Plugin categories still appear as
 * Accordion sections in the no-filter view.
 */

import { type ReactNode } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/primitives/toggle-group";
import { useMsg } from "@/state/editor-i18n-store";
import type { CopyCategoryFilter } from "@/state/editor-ui-store";
import { useCopyCategoryFilter } from "@/state/hooks";

export function TextFilterStrip(): ReactNode {
  const msg = useMsg();
  const [value, setValue] = useCopyCategoryFilter();

  const handleChange = (next: readonly string[]): void => {
    const picked = next[0] as CopyCategoryFilter | undefined;
    if (picked === undefined) return;
    setValue(picked);
  };

  return (
    <ToggleGroup
      value={[value]}
      onValueChange={handleChange}
      aria-label={msg("studio.module.text.name")}
      data-testid="ak-text-filter"
      size="sm"
      spacing={1}
    >
      <ToggleGroupItem value="all">
        {msg("studio.module.text.filter.all")}
      </ToggleGroupItem>
      <ToggleGroupItem value="basic">
        {msg("studio.module.text.filter.basic")}
      </ToggleGroupItem>
      <ToggleGroupItem value="brand">
        {msg("studio.module.text.filter.brand")}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
