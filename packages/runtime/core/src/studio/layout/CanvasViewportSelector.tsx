/**
 * @file Floating top-left canvas control (task Phase 3) — the device
 * preset + configured viewport width, grouped together per DESIGN.md
 * §7.6 ("device preset + viewport width grouped; never two unlabeled
 * values" — this is the ONLY place viewport width is shown; zoom lives
 * in the separate `<CanvasZoomControls>` cluster so the two are never
 * ambiguous). Floats over the canvas instead of anchoring a permanent
 * full-width toolbar row.
 */

import { ChevronDown, Monitor, Smartphone, Tablet } from "lucide-react";
import { memo, type ReactNode, useCallback, useMemo } from "react";
import { useChromeProps } from "@/context/chrome-props";
import { Button } from "@/primitives/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/primitives/dropdown-menu";
import { useMsg } from "@/state/editor-i18n-context";
import { useCanvasViewport } from "@/state/slices/editor-ui-selectors";
import { FULL_WIDTH_VIEWPORTS, type StudioViewport } from "@/studio/ui/index";

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

function CanvasViewportSelectorImpl(): ReactNode {
	const msg = useMsg();
	const { viewports = FULL_WIDTH_VIEWPORTS } = useChromeProps();
	const [viewport, setViewport] = useCanvasViewport();

	const activeViewport = useMemo(
		() => viewports.find((vp) => vp.label === viewport) ?? viewports[0],
		[viewport, viewports],
	);

	const handleViewport = useCallback(
		(label: string): void => {
			setViewport(label);
		},
		[setViewport],
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="sm"
						className="h-8 gap-1.5 border border-[var(--ak-studio-border)] bg-[var(--editor-panel-raised)] px-2 text-[var(--ak-studio-fg)] shadow-[var(--shadow-floating)]"
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
	);
}

// Memoized: takes no props, only its own viewport/chrome-props
// subscriptions should trigger a re-render.
export const CanvasViewportSelector = memo(CanvasViewportSelectorImpl);
