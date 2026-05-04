/**
 * @file `CanvasPreview` — Puck `preview` override.
 *
 * Adds a panel-tinted backdrop and consistent padding around Puck's
 * preview surface. Puck passes no props to this override beyond the
 * standard `RenderFunc` signature.
 */

import { Puck } from "@puckeditor/core";
import { type ReactNode } from "react";

export function CanvasPreview(): ReactNode {
	return (
		<div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-[var(--ak-studio-muted)] p-6">
			<div className="min-h-full w-full bg-[var(--ak-studio-bg)] shadow-sm">
				<Puck.Preview />
			</div>
		</div>
	);
}
