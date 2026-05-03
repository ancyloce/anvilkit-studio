/**
 * @file Internal `<Tooltip>` primitive — the chrome's only tooltip.
 *
 * Wraps Base UI's compound Tooltip parts into a one-shot component
 * that takes `content` + `children` (the trigger). The full compound
 * API is intentionally hidden so layout components stay terse.
 */

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";

import { cn } from "../../overrides/utils/cn.js";

export interface TooltipProps {
	readonly children: ReactNode;
	readonly content: ReactNode;
	readonly side?: "top" | "right" | "bottom" | "left";
	readonly delay?: number;
}

export function Tooltip({
	children,
	content,
	side = "top",
	delay = 200,
}: TooltipProps): ReactNode {
	return (
		<BaseTooltip.Provider delay={delay}>
			<BaseTooltip.Root>
				<BaseTooltip.Trigger render={<span>{children}</span>} />
				<BaseTooltip.Portal>
					<BaseTooltip.Positioner side={side} sideOffset={6}>
						<BaseTooltip.Popup
							className={cn(
								"z-50 rounded-md border border-[var(--ak-studio-border)]",
								"bg-[var(--ak-studio-panel)] px-2 py-1 text-xs",
								"text-[var(--ak-studio-panel-fg)] shadow-sm",
							)}
						>
							{content}
						</BaseTooltip.Popup>
					</BaseTooltip.Positioner>
				</BaseTooltip.Portal>
			</BaseTooltip.Root>
		</BaseTooltip.Provider>
	);
}
