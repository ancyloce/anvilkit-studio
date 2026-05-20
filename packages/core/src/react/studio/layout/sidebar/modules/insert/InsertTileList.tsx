/**
 * @file Single-column list container for Puck Drawer.Items in `list` view mode.
 *
 * Each child (a Puck Drawer.Item) renders as a row at natural height
 * inside a vertical flex column. Like {@link InsertTileGrid}, the
 * Drawer.Item itself is not modified — we only control the surrounding
 * layout so Puck's drag pipeline keeps owning the row.
 */

import { isValidElement, type ReactNode } from "react";

import { Accordion } from "@/primitives/accordion";
import { cn } from "@/utils/cn";

export interface InsertTileListProps {
  readonly children: readonly ReactNode[];
  readonly className?: string;
}

export function InsertTileList({
  children,
  className,
}: InsertTileListProps): ReactNode {
  return (
    <Accordion data-testid="ak-insert-tile-list" className={cn(className)}>
      {children.map((child, index) => {
        const key = isValidElement(child)
          ? (child.key ?? `row-${index}`)
          : `row-${index}`;
        return (
          <div
            key={key}
            className="flex min-h-9 items-center rounded-md px-1 text-sm text-[var(--ak-studio-fg)] transition-colors hover:bg-[var(--ak-studio-muted)]"
          >
            {child}
          </div>
        );
      })}
    </Accordion>
  );
}
