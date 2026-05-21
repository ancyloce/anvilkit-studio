/**
 * @file Module panel container for the sidebar shell (PRD §4.2).
 *
 * Renders to the right of the rail (or to the left in RTL via logical
 * properties). The header surfaces the active module's i18n title
 * (announced via `aria-live="polite"`), an optional `actions` slot
 * for module-specific buttons, and a `×` close that collapses the
 * panel without changing the active module. The body slot receives
 * the module router's output. `Esc` from anywhere inside the panel
 * fires `onEscape` so the parent can collapse + return focus to the
 * active rail tab.
 */

import { X as CloseIcon } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useCallback } from "react";
import { Button } from "@/primitives/button";
import { Separator } from "@/primitives/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-store";
import { SIDEBAR_PANEL_ID } from "./SidebarRail";

export interface SidebarPanelProps {
	/** Pre-resolved module title (caller invokes `useMsg`). */
	readonly title: string;
	/** Module-specific header actions; rendered before the close button. */
	readonly actions?: ReactNode;
	/** Hide the standard module header when the body owns its section chrome. */
	readonly hideHeader?: boolean;
	/** id of the rail tab that controls this panel; for `aria-labelledby`. */
	readonly activeTabId: string;
	/** Called when the user dismisses the panel via the close button. */
	readonly onClose: () => void;
	/** Called when `Esc` is pressed within the panel. */
	readonly onEscape: () => void;
	readonly children: ReactNode;
}

export function SidebarPanel({
	title,
	actions,
	hideHeader = false,
	activeTabId,
	onClose,
	onEscape,
	children,
}: SidebarPanelProps): ReactNode {
	const msg = useMsg();

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLElement>) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onEscape();
			}
		},
		[onEscape],
	);

	return (
		<section
			id={SIDEBAR_PANEL_ID}
			role="tabpanel"
			aria-labelledby={activeTabId}
			tabIndex={-1}
			onKeyDown={handleKeyDown}
			className="flex h-full shrink-0 flex-col border-e border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)]"
			style={{ inlineSize: "var(--ak-studio-panel-width)" }}
		>
			{hideHeader ? null : (
				<header className="flex h-10 shrink-0 items-center justify-center gap-1 border-b border-[var(--ak-studio-border)] px-2">
					<h2
						aria-live="polite"
						className="grow truncate text-sm font-medium text-[var(--ak-studio-fg)]"
					>
						{title}
					</h2>
					{actions !== undefined ? (
						<div className="flex items-center gap-1">{actions}</div>
					) : null}
					<Separator
						orientation="vertical"
						className="h-4 data-vertical:self-center"
					/>
					<Tooltip>
						<TooltipTrigger
							render={
								<span className="inline-flex">
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label={msg("studio.sidebar.close")}
										onClick={onClose}
									>
										<CloseIcon aria-hidden="true" />
									</Button>
								</span>
							}
						/>
						<TooltipContent side="bottom">
							{msg("studio.sidebar.close")}
						</TooltipContent>
					</Tooltip>
				</header>
			)}
			<div className="min-h-0 flex-1 overflow-auto">{children}</div>
		</section>
	);
}
