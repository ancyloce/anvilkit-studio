/**
 * @file Internal `<ScrollArea>` primitive — wraps Base UI's compound
 * scroll area into a single-prop API.
 *
 * Outer `className` styles the root; an additional `viewportClassName`
 * lets layout components target the inner viewport when they need to
 * apply padding without breaking the scrollbar layout.
 */

import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import type { ReactNode } from "react";

import { cn } from "../../overrides/utils/cn.js";

export interface ScrollAreaProps {
	readonly children: ReactNode;
	readonly className?: string;
	readonly viewportClassName?: string;
}

export function ScrollArea({
	children,
	className,
	viewportClassName,
}: ScrollAreaProps): ReactNode {
	return (
		<BaseScrollArea.Root
			className={cn("relative overflow-hidden", className)}
		>
			<BaseScrollArea.Viewport
				className={cn("size-full", viewportClassName)}
			>
				<BaseScrollArea.Content>{children}</BaseScrollArea.Content>
			</BaseScrollArea.Viewport>
			<BaseScrollArea.Scrollbar
				orientation="vertical"
				className="flex w-1.5 touch-none select-none p-px"
			>
				<BaseScrollArea.Thumb className="flex-1 rounded-full bg-[var(--ak-studio-border)]" />
			</BaseScrollArea.Scrollbar>
			<BaseScrollArea.Scrollbar
				orientation="horizontal"
				className="flex h-1.5 touch-none select-none p-px"
			>
				<BaseScrollArea.Thumb className="flex-1 rounded-full bg-[var(--ak-studio-border)]" />
			</BaseScrollArea.Scrollbar>
			<BaseScrollArea.Corner />
		</BaseScrollArea.Root>
	);
}
