/**
 * @file Wraps `<Puck.Preview>` with viewport sizing + zoom from the
 * editor UI store.
 */

import { Puck } from "@puckeditor/core";
import { type ReactNode, useMemo } from "react";

import { FULL_WIDTH_VIEWPORTS } from "../ui/index";
import { useCanvasViewport, useCanvasZoom } from "../state/hooks";
import { cn } from "../../overrides/utils/cn";

export interface StudioViewportPreviewProps {
	readonly className?: string;
}

export function StudioViewportPreview({
	className,
}: StudioViewportPreviewProps): ReactNode {
	const [viewportId] = useCanvasViewport();
	const [zoom] = useCanvasZoom();

	const viewport = useMemo(
		() =>
			FULL_WIDTH_VIEWPORTS.find((vp) => vp.label === viewportId) ??
			FULL_WIDTH_VIEWPORTS[FULL_WIDTH_VIEWPORTS.length - 1],
		[viewportId],
	);

	const width =
		viewport === undefined || viewport.width === "100%"
			? "100%"
			: `${viewport.width}px`;

	return (
		<div
			className={cn(
				"flex min-h-0 flex-1 items-start justify-center overflow-auto bg-[var(--ak-studio-muted)] p-6",
				className,
			)}
		>
			<div
				style={{
					width,
					transform: `scale(${zoom})`,
					transformOrigin: "top center",
				}}
				className="flex min-h-full flex-col self-stretch bg-[var(--ak-studio-bg)] shadow-md transition-[width] duration-200"
			>
				<Puck.Preview />
			</div>
		</div>
	);
}
