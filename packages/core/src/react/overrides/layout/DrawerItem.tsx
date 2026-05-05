/**
 * @file `DrawerItem` — single component card in the insert drawer.
 *
 * Receives `{ name, children }` from Puck's `drawerItem` override.
 * `children` is Puck's draggable node — we place it in the ItemHeader
 * preview surface and render the component name as the tile caption.
 */

import { type ReactNode } from "react";

import { Item, ItemContent, ItemHeader, ItemTitle } from "@/primitives";

const DEFAULT_DRAWER_ITEM_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 120'%3E%3Crect width='160' height='120' rx='8' fill='%23171717'/%3E%3Crect x='14' y='14' width='132' height='92' rx='6' fill='%23202020'/%3E%3Crect x='26' y='28' width='74' height='9' rx='4.5' fill='%23373737'/%3E%3Crect x='26' y='44' width='108' height='6' rx='3' fill='%232f2f2f'/%3E%3Crect x='26' y='62' width='42' height='28' rx='5' fill='%232a2a2a'/%3E%3Crect x='78' y='62' width='56' height='28' rx='5' fill='%23303030'/%3E%3C/svg%3E";

export interface DrawerItemProps {
  readonly name: string;
  readonly image?: string;
  readonly children: ReactNode;
}

export function DrawerItem({
  name,
  image,
  children,
}: DrawerItemProps): ReactNode {
  const previewImage =
    image !== undefined && image.trim().length > 0
      ? image
      : DEFAULT_DRAWER_ITEM_IMAGE;

  return (
    <Item
      variant="outline"
      size="xs"
      className="group/drawer-item h-full cursor-grab items-stretch rounded-md bg-[var(--ak-studio-muted)] p-0 text-center text-[var(--ak-studio-fg)] hover:border-[var(--ak-studio-accent)] active:cursor-grabbing overflow-hidden"
      data-drawer-item={name}
    >
      <ItemHeader className="relative aspect-[4/3] h-auto w-full overflow-hidden">
        <img
          src={previewImage}
          alt={`${name} preview`}
          draggable={false}
          className="size-full object-cover"
        />
        <div aria-hidden="true" className="absolute inset-0 opacity-0">
          {children}
        </div>
      </ItemHeader>
      <ItemContent className="basis-full min-w-0 items-center gap-0">
        <ItemTitle className="w-full p-2 pt-0 justify-center truncate text-[11px] leading-tight font-medium text-[var(--ak-studio-muted-fg)]">
          {name}
        </ItemTitle>
      </ItemContent>
    </Item>
  );
}
