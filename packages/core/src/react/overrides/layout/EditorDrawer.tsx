/**
 * @file `EditorDrawer` — Puck `drawer` override entry point.
 *
 * Delegates the actual sectioned/grid/list rendering to
 * {@link InsertDrawerBody} which lives next to the `insert` module so
 * the override file stays free of module internals. Puck calls this
 * with `children` populated by its own draggable `Drawer.Item`
 * elements; we hand them over to the body unmodified so the DnD
 * pipeline keeps owning each row.
 */

import type { ReactNode } from "react";

import { InsertDrawerBody } from "@/layout/sidebar/modules/insert/InsertDrawerBody";

export interface EditorDrawerProps {
  readonly children: ReactNode;
}

export function EditorDrawer({ children }: EditorDrawerProps): ReactNode {
  return <InsertDrawerBody>{children}</InsertDrawerBody>;
}
