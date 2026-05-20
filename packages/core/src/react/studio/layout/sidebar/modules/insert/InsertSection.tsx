/**
 * @file Single accordion section in the `insert` module.
 *
 * Wraps an `Accordion.Item` with the section's i18n title (resolved
 * via `useMsg`) and a body rendered as either a grid or a list of
 * Puck Drawer.Items, switched by the active `componentViewMode`.
 *
 * The collapse/expand state is owned by the caller through the
 * `Accordion` `value` array — `InsertDrawerBody` derives that
 * array from the persisted `insertSectionsExpanded` slice.
 */

import type { ReactNode } from "react";

import {
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/primitives/accordion";
import { useMsg } from "@/state/editor-i18n-store";
import type { ComponentViewMode } from "@/state/editor-ui-store";
import { InsertTileGrid } from "./InsertTileGrid";
import { InsertTileList } from "./InsertTileList";

export interface InsertSectionProps {
  readonly id: string;
  readonly titleKey: string;
  readonly viewMode: ComponentViewMode;
  readonly children: readonly ReactNode[];
}

export function InsertSection({
  id,
  titleKey,
  viewMode,
  children,
}: InsertSectionProps): ReactNode {
  const msg = useMsg();
  const Tiles = viewMode === "grid" ? InsertTileGrid : InsertTileList;

  return (
    <AccordionItem
      value={id}
      data-testid={`ak-insert-section-${id}`}
      className="border-b-0"
    >
      <AccordionTrigger className="min-h-8 px-2 py-1.5 text-xs font-medium hover:no-underline">
        <span className="grow truncate">{msg(titleKey)}</span>
      </AccordionTrigger>
      <AccordionPanel className="p-0">
        <Tiles>{children}</Tiles>
      </AccordionPanel>
    </AccordionItem>
  );
}
