/**
 * @file Canvas toolbar — viewport dropdown, undo / redo, zoom, home.
 */

import { useGetPuck } from "@puckeditor/core";
import {
	ChevronDown,
	Home,
	Monitor,
	Redo2,
	Smartphone,
	Tablet,
	Undo2,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { memo, type ReactNode, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useChromeProps } from "@/context/chrome-props";
import { useStudioPagesSource } from "@/context/pages-source";
import { Button } from "@/primitives/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/primitives/dropdown-menu";
import { Separator } from "@/primitives/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-store";
import { useCanvasViewport, useCanvasZoom } from "@/state/hooks";
import { FULL_WIDTH_VIEWPORTS, type StudioViewport } from "@/studio/ui/index";

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;

const VIEWPORT_ICON: Record<string, ReactNode> = {
	mobile: <Smartphone className="size-4" aria-hidden="true" />,
	tablet: <Tablet className="size-4" aria-hidden="true" />,
	desktop: <Monitor className="size-4" aria-hidden="true" />,
	full: <Monitor className="size-4" aria-hidden="true" />,
	Smartphone: <Smartphone className="size-4" aria-hidden="true" />,
	Tablet: <Tablet className="size-4" aria-hidden="true" />,
	Monitor: <Monitor className="size-4" aria-hidden="true" />,
};

function formatViewportWidth(width: StudioViewport["width"]): string {
	if (typeof width === "number") return `${width}px`;
	return width;
}

function viewportIcon(viewport: StudioViewport | undefined): ReactNode {
	if (viewport === undefined) return null;
	if (typeof viewport.icon !== "string") {
		return viewport.icon ?? VIEWPORT_ICON.Monitor;
	}
	return VIEWPORT_ICON[viewport.icon] ?? VIEWPORT_ICON.Monitor;
}

function viewportLabel(
	msg: (key: string, fallback?: string) => string,
	viewport: StudioViewport,
): string {
	return msg(`studio.toolbar.viewport.${viewport.label}`, viewport.label);
}

function StudioToolbarImpl(): ReactNode {
	const msg = useMsg();
	const { viewports = FULL_WIDTH_VIEWPORTS } = useChromeProps();
	const [viewport, setViewport] = useCanvasViewport();
	const [zoom, setZoom] = useCanvasZoom();
	const getPuck = useGetPuck();
	const pagesSource = useStudioPagesSource();

	const activeViewport = useMemo(
		() => viewports.find((vp) => vp.label === viewport) ?? viewports[0],
		[viewport, viewports],
	);

	// Stable handler identity so the memo boundary on the Button/Tooltip
	// children holds across toolbar re-renders.
	const undo = useCallback((): void => {
		getPuck().history.back();
	}, [getPuck]);
	const redo = useCallback((): void => {
		getPuck().history.forward();
	}, [getPuck]);
	const handleViewport = useCallback(
		(label: string): void => {
			setViewport(label);
		},
		[setViewport],
	);

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

	const homeDisabled = pagesSource === undefined;

	return (
		<div className="flex h-10 items-center gap-1 border-b border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] px-3">
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							size="sm"
							className="gap-1.5 px-2 text-[var(--ak-studio-fg)]"
						>
							{viewportIcon(activeViewport)}
							<span className="text-xs font-medium">
								{activeViewport
									? viewportLabel(msg, activeViewport)
									: msg("studio.actions.viewport")}
							</span>
							<ChevronDown
								className="size-3 text-[var(--ak-studio-muted-fg)]"
								aria-hidden="true"
							/>
							{activeViewport ? (
								<span className="ms-1 text-xs tabular-nums text-[var(--ak-studio-muted-fg)]">
									{formatViewportWidth(activeViewport.width)}
								</span>
							) : null}
						</Button>
					}
				/>
				<DropdownMenuContent align="start">
					{viewports.map((vp) => (
						<DropdownMenuItem
							key={vp.label}
							onClick={() => handleViewport(vp.label)}
							className="gap-2"
						>
							{viewportIcon(vp)}
							<span className="grow text-xs">{viewportLabel(msg, vp)}</span>
							<span className="text-xs tabular-nums text-muted-foreground">
								{formatViewportWidth(vp.width)}
							</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			<div className="ms-auto flex items-center gap-0.5">
				<Tooltip>
					<TooltipTrigger
						render={
							<span className="inline-flex">
								<Button variant="ghost" size="icon" onClick={undo}>
									<Undo2 />
								</Button>
							</span>
						}
					/>
					<TooltipContent>{msg("studio.actions.undo")}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<span className="inline-flex">
								<Button variant="ghost" size="icon" onClick={redo}>
									<Redo2 />
								</Button>
							</span>
						}
					/>
					<TooltipContent>{msg("studio.actions.redo")}</TooltipContent>
				</Tooltip>

				<Separator
					orientation="vertical"
					className="mx-1 h-6 data-vertical:self-center"
				/>

				<Tooltip>
					<TooltipTrigger
						render={
							<span className="inline-flex">
								<Button
									variant="ghost"
									size="icon"
									onClick={() => setZoom(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))}
									disabled={zoom <= ZOOM_MIN}
								>
									<ZoomOut />
								</Button>
							</span>
						}
					/>
					<TooltipContent>{msg("studio.actions.zoomOut")}</TooltipContent>
				</Tooltip>
				<span className="w-12 text-center text-xs tabular-nums text-[var(--ak-studio-muted-fg)]">
					{Math.round(zoom * 100)}%
				</span>
				<Tooltip>
					<TooltipTrigger
						render={
							<span className="inline-flex">
								<Button
									variant="ghost"
									size="icon"
									onClick={() => setZoom(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))}
									disabled={zoom >= ZOOM_MAX}
								>
									<ZoomIn />
								</Button>
							</span>
						}
					/>
					<TooltipContent>{msg("studio.actions.zoomIn")}</TooltipContent>
				</Tooltip>

				<Separator
					orientation="vertical"
					className="mx-1 h-6 data-vertical:self-center"
				/>

				<Tooltip>
					<TooltipTrigger
						render={
							<span className="inline-flex">
								<Button
									variant="ghost"
									size="sm"
									className="gap-1.5"
									onClick={() => {
										void goHome();
									}}
									disabled={homeDisabled}
								>
									<Home className="size-4" aria-hidden="true" />
									<span className="text-xs font-medium">
										{msg("studio.actions.home")}
									</span>
								</Button>
							</span>
						}
					/>
					<TooltipContent>{msg("studio.actions.home")}</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}

// Memoized: the toolbar takes no props, so a `StudioLayout` re-render
// (selection change) shouldn't re-render it — only its own viewport /
// zoom / pages-source subscriptions should.
export const StudioToolbar = memo(StudioToolbarImpl);
