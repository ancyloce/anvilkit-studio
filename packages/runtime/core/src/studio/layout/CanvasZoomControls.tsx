/**
 * @file Floating bottom-center canvas control (task Phase 3) — Fit / − /
 * zoom% / + (DESIGN.md §7.6). Zoom is always `%`, never confusable with
 * the viewport-width control in `<CanvasViewportSelector>` (labeled
 * `px`). Floats over the canvas instead of a permanent toolbar row, and
 * does not scale with the canvas itself (it's a sibling of the
 * scrollable workspace, not a descendant of the zoomed content).
 */

import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { memo, type ReactNode, useCallback } from "react";
import { Button } from "@/primitives/button";
import { Separator } from "@/primitives/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-context";
import { useCanvasZoom } from "@/state/slices/editor-ui-selectors";

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
/** Horizontal `p-6` workspace padding (24px) counted on both edges. */
const WORKSPACE_PADDING_PX = 48;

export interface CanvasZoomControlsProps {
	/** Measured natural (unscaled) canvas-frame width, 0 before the first measurement. */
	readonly naturalWidth: number;
	/** Measured workspace (scrollable container) width, 0 before the first measurement. */
	readonly workspaceWidth: number;
}

function clampZoom(zoom: number): number {
	if (zoom < ZOOM_MIN) return ZOOM_MIN;
	if (zoom > ZOOM_MAX) return ZOOM_MAX;
	return zoom;
}

function CanvasZoomControlsImpl({
	naturalWidth,
	workspaceWidth,
}: CanvasZoomControlsProps): ReactNode {
	const msg = useMsg();
	const [zoom, setZoom] = useCanvasZoom();

	const canFit = naturalWidth > 0 && workspaceWidth > 0;
	const fit = useCallback((): void => {
		if (!canFit) return;
		setZoom(clampZoom((workspaceWidth - WORKSPACE_PADDING_PX) / naturalWidth));
	}, [canFit, naturalWidth, setZoom, workspaceWidth]);

	return (
		<div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
			<div className="flex h-8 items-center gap-0.5 rounded-lg border border-[var(--ak-studio-border)] bg-[var(--editor-panel-raised)] px-1 shadow-[var(--shadow-floating)]">
				<Tooltip>
					<TooltipTrigger
						render={
							<span className="inline-flex">
								<Button
									variant="ghost"
									size="sm"
									className="h-6 gap-1 px-1.5 text-xs font-medium"
									onClick={fit}
									disabled={!canFit}
								>
									<Maximize className="size-3.5" aria-hidden="true" />
									{msg("studio.actions.zoomFit")}
								</Button>
							</span>
						}
					/>
					<TooltipContent>{msg("studio.actions.zoomFit")}</TooltipContent>
				</Tooltip>

				<Separator
					orientation="vertical"
					className="mx-0.5 h-5 data-vertical:self-center"
				/>

				<Tooltip>
					<TooltipTrigger
						render={
							<span className="inline-flex">
								<Button
									variant="ghost"
									size="icon"
									className="size-6"
									onClick={() => setZoom(clampZoom(zoom - ZOOM_STEP))}
									disabled={zoom <= ZOOM_MIN}
									aria-label={msg("studio.actions.zoomOut")}
								>
									<ZoomOut className="size-3.5" />
								</Button>
							</span>
						}
					/>
					<TooltipContent>{msg("studio.actions.zoomOut")}</TooltipContent>
				</Tooltip>
				<span
					className="w-10 text-center text-xs tabular-nums text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-canvas-zoom-value"
				>
					{Math.round(zoom * 100)}%
				</span>
				<Tooltip>
					<TooltipTrigger
						render={
							<span className="inline-flex">
								<Button
									variant="ghost"
									size="icon"
									className="size-6"
									onClick={() => setZoom(clampZoom(zoom + ZOOM_STEP))}
									disabled={zoom >= ZOOM_MAX}
									aria-label={msg("studio.actions.zoomIn")}
								>
									<ZoomIn className="size-3.5" />
								</Button>
							</span>
						}
					/>
					<TooltipContent>{msg("studio.actions.zoomIn")}</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}

export const CanvasZoomControls = memo(CanvasZoomControlsImpl);
