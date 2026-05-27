/**
 * @file Wraps `<Puck.Preview>` with viewport sizing + zoom from the
 * editor UI store.
 */

import { Puck } from "@puckeditor/core";
import { memo, type ReactNode, useMemo } from "react";
import { useChromeProps } from "@/context/chrome-props";
import { useCanvasViewport, useCanvasZoom } from "@/state/hooks";
import { FULL_WIDTH_VIEWPORTS } from "@/studio/ui/index";
import { cn } from "@/utils/cn";

export interface StudioViewportPreviewProps {
	readonly className?: string;
}

function StudioViewportPreviewImpl({
	className,
}: StudioViewportPreviewProps): ReactNode {
	const [viewportId] = useCanvasViewport();
	const [zoom] = useCanvasZoom();
	const { viewports = FULL_WIDTH_VIEWPORTS } = useChromeProps();

	const viewport = useMemo(
		() =>
			viewports.find((vp) => vp.label === viewportId) ??
			viewports[viewports.length - 1],
		[viewportId, viewports],
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

// Memoized so a `StudioLayout` re-render (e.g. selection toggling the
// fields panel) doesn't re-run the preview wrapper — it only re-renders
// when its own viewport / zoom store subscriptions change.
export const StudioViewportPreview = memo(StudioViewportPreviewImpl);
