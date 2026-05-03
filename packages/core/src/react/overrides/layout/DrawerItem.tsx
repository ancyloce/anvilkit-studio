/**
 * @file `DrawerItem` — single component card in the insert drawer.
 *
 * Receives `{ name, children }` from Puck's `drawerItem` override.
 * `children` is Puck's draggable node — we wrap it with a labeled
 * card. A metadata thumbnail slot is reserved for a future
 * iteration; v1 falls back to the component name.
 */

import { GripVertical } from "lucide-react";
import { type ReactNode } from "react";

export interface DrawerItemProps {
	readonly name: string;
	readonly children: ReactNode;
}

export function DrawerItem({ name, children }: DrawerItemProps): ReactNode {
	return (
		<div
			className="group flex cursor-grab items-center gap-2 rounded-md border border-transparent bg-[var(--ak-studio-bg)] p-2 text-sm text-[var(--ak-studio-fg)] transition-colors hover:border-[var(--ak-studio-border)] hover:bg-[var(--ak-studio-muted)]"
			data-drawer-item={name}
		>
			<GripVertical className="size-3.5 text-[var(--ak-studio-muted-fg)] opacity-0 transition-opacity group-hover:opacity-100" />
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<span className="truncate font-medium">{name}</span>
			</div>
			{/* Puck mounts its drag affordance through `children` — we
			    render it last so the drag handle is on the right. */}
			<div className="shrink-0">{children}</div>
		</div>
	);
}
