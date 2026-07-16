/**
 * @file Floating Home action (task Phase 3) — interim home for the
 * "go to the first page" action while it moves out of the (now removed)
 * full-width canvas toolbar. DESIGN.md's target is the document/Pages
 * navigation context; Phase 6 (Pages/Layers rework) relocates this into
 * the Pages panel proper. Kept here, next to the viewport selector, in
 * the meantime so the working behavior isn't dropped in between phases.
 */

import { Home } from "lucide-react";
import { memo, type ReactNode, useCallback } from "react";
import { toast } from "sonner";
import { useStudioPagesSource } from "@/context/pages-source";
import { Button } from "@/primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-context";

function CanvasHomeButtonImpl(): ReactNode {
	const msg = useMsg();
	const pagesSource = useStudioPagesSource();

	const goHome = useCallback(async () => {
		if (pagesSource === undefined) return;
		try {
			const list = await Promise.resolve(pagesSource.list());
			const first = list[0];
			if (first === undefined) return;
			pagesSource.onSelect?.(first.id);
		} catch {
			toast.error(msg("studio.module.layer.pages.error"));
		}
	}, [msg, pagesSource]);

	const disabled = pagesSource === undefined;

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<span className="inline-flex">
						<Button
							variant="ghost"
							size="icon"
							className="size-8 border border-[var(--ak-studio-border)] bg-[var(--editor-panel-raised)] shadow-[var(--shadow-floating)]"
							onClick={() => {
								void goHome();
							}}
							disabled={disabled}
							aria-label={msg("studio.actions.home")}
						>
							<Home className="size-4" aria-hidden="true" />
						</Button>
					</span>
				}
			/>
			<TooltipContent>{msg("studio.actions.home")}</TooltipContent>
		</Tooltip>
	);
}

export const CanvasHomeButton = memo(CanvasHomeButtonImpl);
