import {
	DropdownMenuCheckboxItem,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@anvilkit/ui/dropdown-menu";
import { cn } from "@anvilkit/ui/lib/utils";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import * as React from "react";

/**
 * Context menu primitive (UI-1, PRD-0012 M0-06 audit). Base UI's ContextMenu
 * shares every part except Root/Trigger with the Menu that dropdown-menu.tsx
 * already wraps — the item/separator/sub parts below are literal re-exports
 * of those same components (identical runtime component, identical styling;
 * their `data-slot` attributes keep the dropdown-menu- prefix).
 */

function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
	return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

/** Right-click (or long-press) surface that opens the menu at the pointer. */
function ContextMenuTrigger({ ...props }: ContextMenuPrimitive.Trigger.Props) {
	return (
		<ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
	);
}

function ContextMenuContent({
	className,
	...props
}: ContextMenuPrimitive.Popup.Props) {
	return (
		<ContextMenuPrimitive.Portal>
			<ContextMenuPrimitive.Positioner className="isolate z-50 outline-none">
				<ContextMenuPrimitive.Popup
					data-slot="context-menu-content"
					className={cn(
						"z-50 max-h-(--available-height) min-w-40 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
						className,
					)}
					{...props}
				/>
			</ContextMenuPrimitive.Positioner>
		</ContextMenuPrimitive.Portal>
	);
}

export {
	ContextMenu,
	ContextMenuContent,
	ContextMenuTrigger,
	DropdownMenuCheckboxItem as ContextMenuCheckboxItem,
	DropdownMenuGroup as ContextMenuGroup,
	DropdownMenuItem as ContextMenuItem,
	DropdownMenuLabel as ContextMenuLabel,
	DropdownMenuRadioGroup as ContextMenuRadioGroup,
	DropdownMenuRadioItem as ContextMenuRadioItem,
	DropdownMenuSeparator as ContextMenuSeparator,
	DropdownMenuShortcut as ContextMenuShortcut,
	DropdownMenuSub as ContextMenuSub,
	DropdownMenuSubContent as ContextMenuSubContent,
	DropdownMenuSubTrigger as ContextMenuSubTrigger,
};
