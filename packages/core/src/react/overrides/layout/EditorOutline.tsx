/**
 * @file `EditorOutline` — sidebar outline tab body.
 *
 * Renders Puck's compound outline plus a "selected component"
 * summary card. NOT bound to the Puck `outline` override slot —
 * that slot replaces Puck's outline body, which would recurse if
 * we then re-rendered `<Puck.Outline />`. Instead, the chrome
 * mounts this component directly inside the sidebar tab.
 */

import { Puck } from "@puckeditor/core";
import { type ReactNode } from "react";
import { ScrollArea } from "@/primitives/scroll-area";
import { Separator } from "@/primitives/separator";
import { useMsg } from "@/state/editor-i18n-store";
import { useReactivePuck } from "../utils/use-reactive-puck";

export function EditorOutline(): ReactNode {
	const msg = useMsg();
	// Reactive: the selection summary must update live as the canvas
	// selection changes (a non-subscribing `useGetPuck()` snapshot read
	// here would go stale until an unrelated re-render).
	const selected = useReactivePuck((s) => s.selectedItem ?? null);

	return (
		<div className="flex flex-col">
			<ScrollArea className="max-h-[60vh]">
				<div className="px-1 py-2">
					<Puck.Outline />
				</div>
			</ScrollArea>
			<Separator className="my-2" />
			<div className="px-2 py-1 text-xs text-[var(--ak-studio-muted-fg)]">
				{selected === null ? (
					<span>{msg("studio.outline.empty")}</span>
				) : (
					<span>
						<span className="font-medium text-[var(--ak-studio-fg)]">
							{selected.type}
						</span>
						<span className="ml-1 opacity-70">selected</span>
					</span>
				)}
			</div>
		</div>
	);
}
