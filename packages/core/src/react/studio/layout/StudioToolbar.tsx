/**
 * @file Canvas toolbar — viewport selector, zoom, undo, redo.
 */

import { useGetPuck } from "@puckeditor/core";
import {
	Monitor,
	Redo2,
	Smartphone,
	Tablet,
	Undo2,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { type ReactNode, useMemo } from "react";

import {
	FULL_WIDTH_VIEWPORTS,
	type StudioViewport,
} from "../ui/index.js";
import {
	useCanvasViewport,
	useCanvasZoom,
} from "../state/hooks.js";
import { useMsg } from "../state/editor-i18n-store.js";
import { Button } from "../primitives/Button.js";
import { Separator } from "../primitives/Separator.js";
import { Tooltip } from "../primitives/Tooltip.js";

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;

const VIEWPORT_ICON: Record<StudioViewport["label"], ReactNode> = {
	mobile: <Smartphone />,
	tablet: <Tablet />,
	desktop: <Monitor />,
	full: <Monitor />,
};

export function StudioToolbar(): ReactNode {
	const msg = useMsg();
	const [viewport, setViewport] = useCanvasViewport();
	const [zoom, setZoom] = useCanvasZoom();
	const getPuck = useGetPuck();

	const viewports = useMemo(() => FULL_WIDTH_VIEWPORTS, []);

	const undo = (): void => {
		getPuck().history.back();
	};
	const redo = (): void => {
		getPuck().history.forward();
	};

	return (
		<div className="flex h-10 items-center gap-1 border-b border-[var(--ak-studio-border)] bg-[var(--ak-studio-bg)] px-3">
			<div className="flex items-center gap-0.5">
				{viewports.map((vp) => (
					<Tooltip key={vp.label} content={vp.label}>
						<Button
							variant={viewport === vp.label ? "default" : "ghost"}
							size="icon"
							onClick={() => setViewport(vp.label)}
						>
							{VIEWPORT_ICON[vp.label]}
						</Button>
					</Tooltip>
				))}
			</div>
			<Separator orientation="vertical" className="mx-1 h-6" />
			<div className="flex items-center gap-0.5">
				<Tooltip content={msg("studio.actions.zoomOut")}>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setZoom(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))}
						disabled={zoom <= ZOOM_MIN}
					>
						<ZoomOut />
					</Button>
				</Tooltip>
				<span className="w-12 text-center text-xs tabular-nums text-[var(--ak-studio-muted-fg)]">
					{Math.round(zoom * 100)}%
				</span>
				<Tooltip content={msg("studio.actions.zoomIn")}>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setZoom(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))}
						disabled={zoom >= ZOOM_MAX}
					>
						<ZoomIn />
					</Button>
				</Tooltip>
			</div>
			<Separator orientation="vertical" className="mx-1 h-6" />
			<Tooltip content={msg("studio.actions.undo")}>
				<Button variant="ghost" size="icon" onClick={undo}>
					<Undo2 />
				</Button>
			</Tooltip>
			<Tooltip content={msg("studio.actions.redo")}>
				<Button variant="ghost" size="icon" onClick={redo}>
					<Redo2 />
				</Button>
			</Tooltip>
		</div>
	);
}
