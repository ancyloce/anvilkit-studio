/**
 * @file `insert` module body — Component Library (PRD §5).
 *
 * Mounts `<Puck.Components />` inside the panel so Puck's drag-and-drop
 * pipeline keeps owning each Drawer.Item; the rendered shape comes
 * from the chrome's `drawer` override (which delegates to
 * {@link InsertDrawerBody}). The search input lives at the top of the
 * module body — per PRD §5.2 mock, it sits below the panel header and
 * scrolls together with the section list.
 *
 * The grid/list view-mode toggle is published into the panel header
 * via {@link useSetSidebarHeaderActions} so it appears next to the
 * `×` close button (PRD §5.2 mock: `[▦][▤] ×`).
 */

import { Puck } from "@puckeditor/core";
import { type ReactNode, useMemo } from "react";

import { useSetSidebarHeaderActions } from "@/layout/sidebar/SidebarHeaderActionsContext";
import { InsertSearchBar } from "./insert/InsertSearchBar";
import { InsertViewToggle } from "./insert/InsertViewToggle";

export function InsertModule(): ReactNode {
  // Stable element so the header-actions slot is only updated on
  // mount/unmount, not on every parent re-render.
  const headerActions = useMemo(() => <InsertViewToggle />, []);
  useSetSidebarHeaderActions(headerActions);

  return (
    <div data-testid="ak-module-insert" className="flex h-full flex-col">
      <div className="shrink-0 border-b border-[var(--ak-studio-border)] p-2">
        <InsertSearchBar />
      </div>
      <div className="min-h-0 flex-1">
        <Puck.Components />
      </div>
    </div>
  );
}
