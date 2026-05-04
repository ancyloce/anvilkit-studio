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
import { type ReactNode, useCallback, useMemo } from "react";
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

const VIEWPORT_ICON: Record<StudioViewport["label"], ReactNode> = {
	mobile: <Smartphone className="size-4" aria-hidden="true" />,
	tablet: <Tablet className="size-4" aria-hidden="true" />,
	desktop: <Monitor className="size-4" aria-hidden="true" />,
	full: <Monitor className="size-4" aria-hidden="true" />,
};

function formatViewportWidth(width: StudioViewport["width"]): string {
	if (typeof width === "number") return `${width}px`;
	return width;
}

export function StudioToolbar(): ReactNode {
	const msg = useMsg();
	const [viewport, setViewport] = useCanvasViewport();
	const [zoom, setZoom] = useCanvasZoom();
	const getPuck = useGetPuck();
	const pagesSource = useStudioPagesSource();

	const viewports = useMemo(() => FULL_WIDTH_VIEWPORTS, []);
	const activeViewport = useMemo(
		() => viewports.find((vp) => vp.label === viewport) ?? viewports[0],
		[viewport, viewports],
	);

	const undo = (): void => {
		getPuck().history.back();
	};
	const redo = (): void => {
		getPuck().history.forward();
	};

	const goHome = useCallback(async () => {
		if (pagesSource === undefined) return;
		const list = await pagesSource.list();
		const first = list[0];
		if (first === undefined) return;
		pagesSource.onSelect?.(first.id);
	}, [pagesSource]);

	const homeDisabled = pagesSource === undefined;

	return (
		<div className="flex h-10 items-center gap-1 border-b border-[var(--ak-studio-border)] bg-[var(--ak-studio-bg)] px-3">
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							size="sm"
							className="gap-1.5 px-2 text-[var(--ak-studio-fg)]"
						>
							{activeViewport ? VIEWPORT_ICON[activeViewport.label] : null}
							<span className="text-xs font-medium">
								{activeViewport
									? msg(`studio.toolbar.viewport.${activeViewport.label}`)
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
							onClick={() => setViewport(vp.label)}
							className="gap-2"
						>
							{VIEWPORT_ICON[vp.label]}
							<span className="grow text-xs">
								{msg(`studio.toolbar.viewport.${vp.label}`)}
							</span>
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

				<Separator orientation="vertical" className="mx-1 h-6" />

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

				<Separator orientation="vertical" className="mx-1 h-6" />

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
