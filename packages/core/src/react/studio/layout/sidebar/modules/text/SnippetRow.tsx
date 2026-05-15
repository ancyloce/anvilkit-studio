/**
 * @file Single snippet row in the Copywriting module (PRD §8.2 / §8.5).
 *
 * Layout: title (single-line truncate) over a 2-line body preview.
 * Hovering the row reveals the full body via the shared {@link Tooltip}
 * primitive. When `disabled` is true (no compatible canvas selection)
 * the row dims to telegraph the requirement; the click still fires so
 * the insert command can surface the explanatory toast.
 */

import { type DragEvent, type ReactNode } from "react";
import { encodeDropPayload } from "@/canvas-drop";
import { Button } from "@/primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import type { StudioCopySnippet } from "@/types/sidebar";
import { cn } from "@/utils/cn";

export interface SnippetRowProps {
	readonly snippet: StudioCopySnippet;
	readonly disabled: boolean;
	readonly onClick: (snippet: StudioCopySnippet) => void;
}

export function SnippetRow({
	snippet,
	disabled,
	onClick,
}: SnippetRowProps): ReactNode {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onClick(snippet)}
						draggable
						onDragStart={(event: DragEvent<HTMLButtonElement>) => {
							encodeDropPayload(event.dataTransfer, {
								kind: "text",
								body: snippet.body,
							});
							event.dataTransfer.effectAllowed = "copy";
						}}
						aria-disabled={disabled || undefined}
						data-disabled={disabled || undefined}
						data-testid={`ak-text-snippet-${snippet.id}`}
						className={cn(
							"h-auto w-full min-w-0 flex-col items-start gap-0.5 overflow-hidden rounded-md border border-transparent px-2 py-1.5 text-start font-normal",
							"text-[var(--ak-studio-fg)] outline-none",
							"hover:border-[var(--ak-studio-border)] hover:bg-[var(--ak-studio-muted)]",
							"focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]",
							disabled && "opacity-50",
						)}
					>
						<span className="w-full min-w-0 truncate text-xs font-medium">
							{snippet.title}
						</span>
						<span className="line-clamp-2 w-full min-w-0 break-words text-xs text-[var(--ak-studio-muted-fg)]">
							{snippet.body}
						</span>
					</Button>
				}
			/>
			<TooltipContent side="right" className="break-words">
				{snippet.body}
			</TooltipContent>
		</Tooltip>
	);
}
