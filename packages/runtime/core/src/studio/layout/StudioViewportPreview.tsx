/**
 * @file Wraps `<Puck.Preview>` with viewport sizing + zoom from the
 * editor UI store.
 *
 * Zoom stage architecture (task Phase 4): `transform: scale()` alone
 * does not change an element's layout box, so a naive
 * `<canvas frame style={{ transform: scale(zoom) }}>` inside an
 * `overflow-auto` workspace produces wrong scroll bounds — the
 * scrollable area always reflects the UNSCALED size, causing dead
 * whitespace when zoomed out and clipped content when zoomed in.
 *
 * `Workspace > Zoom Stage > Canvas Frame > Puck.Preview` fixes this:
 * the Zoom Stage is a plain, untransformed box explicitly sized to
 * `naturalSize * zoom` (width via `useCanvasFrameSize`'s
 * `ResizeObserver` on the workspace; height via `canvasRootHeight`,
 * see below), so the workspace's scrollable content genuinely reflects
 * the visual size at any zoom level. The Canvas Frame keeps the
 * natural (unscaled) width/height and owns the `transform: scale(zoom)`
 * with `transform-origin: top left`, so its scaled visual box exactly
 * fills the Zoom Stage's declared box.
 *
 * ### Why the frame's height comes from the store, not a local `ResizeObserver`
 *
 * An `<iframe>` (what `<Puck.Preview>` renders) is a replaced element:
 * unlike a normal block child, its box never auto-grows to match its
 * own document's content, so observing the Canvas Frame's OWN
 * rendered box for "natural height" is circular — that box's height
 * is entirely a function of the CSS we put on it, never of what's
 * actually inside the iframe. `canvasRootHeight` (`useCanvasRootHeight`)
 * is measured from INSIDE the iframe instead — see `CanvasIframe.tsx`,
 * which observes Puck's own `#frame-root` mount sentinel (real DOM
 * content, not a replaced element, so its box genuinely reflects the
 * portal-mounted page) and reports it up through the editor UI store.
 * That value becomes the frame's explicit `height` below, which is
 * also what lets Puck's own `_PuckPreview-frame_ { height: 100% }`
 * resolve down to the iframe — a `min-height` alone never establishes
 * a percentage basis, so without this the iframe collapses to the
 * browser's UA-default 150px regardless of the surrounding chrome.
 */

import { Puck } from "@puckeditor/core";
import { memo, type ReactNode, useMemo, useRef } from "react";
import { useChromeProps } from "@/context/chrome-props";
import { cn } from "@/shared/cn";
import {
	useCanvasRootHeight,
	useCanvasViewport,
	useCanvasZoom,
} from "@/state/slices/editor-ui-selectors";
import { FULL_WIDTH_VIEWPORTS } from "@/studio/ui/index";
import { CanvasHomeButton } from "./CanvasHomeButton";
import { CanvasViewportSelector } from "./CanvasViewportSelector";
import { CanvasZoomControls } from "./CanvasZoomControls";
import { useCanvasFrameSize } from "./use-canvas-frame-size";

export interface StudioViewportPreviewProps {
	readonly className?: string;
}

function StudioViewportPreviewImpl({
	className,
}: StudioViewportPreviewProps): ReactNode {
	const [viewportId] = useCanvasViewport();
	const [zoom] = useCanvasZoom();
	const [canvasRootHeight] = useCanvasRootHeight();
	const { viewports = FULL_WIDTH_VIEWPORTS } = useChromeProps();

	const viewport = useMemo(
		() =>
			viewports.find((vp) => vp.label === viewportId) ??
			viewports[viewports.length - 1],
		[viewportId, viewports],
	);

	const { ref: workspaceRef, size: workspaceSize } =
		useCanvasFrameSize<HTMLDivElement>();
	const frameRef = useRef<HTMLDivElement>(null);

	// The "full" viewport preset (DESIGN.md §1.3: viewport width is
	// always a distinct, labeled value) has no fixed pixel width — its
	// natural width is whatever the workspace makes available. Fixed
	// presets (mobile/tablet/desktop) already carry a definite number,
	// so no measurement round-trip is needed and there's no first-frame
	// flash for the common case.
	const isFluidWidth = viewport === undefined || viewport.width === "100%";
	const naturalWidth = isFluidWidth
		? workspaceSize.width
		: (viewport.width as number);

	// The frame's own natural height is always content-driven (every
	// current viewport preset uses `height: "auto"`) — `naturalHeight`
	// is the REAL page content height reported from inside the iframe
	// (see the file doc). `min-height` keeps the frame's background/
	// border filling the workspace for short pages, expressed in the
	// frame's own (unscaled) coordinate space so it still exactly fills
	// the workspace once the `zoom` transform is applied
	// (`workspaceHeight / zoom`, not `workspaceHeight`); CSS resolves
	// the larger of the two (`height` vs `min-height`) automatically —
	// the zoom stage below floors the same way via its own CSS
	// `minHeight: "100%"`, so no JS-side `Math.max` is needed here.
	const frameMinHeight =
		workspaceSize.height > 0 && zoom > 0
			? workspaceSize.height / zoom
			: undefined;
	const naturalHeight = canvasRootHeight;

	const stageWidth = naturalWidth > 0 ? naturalWidth * zoom : undefined;
	const stageHeight = naturalHeight > 0 ? naturalHeight * zoom : undefined;

	return (
		// `relative` so the floating controls below anchor to this stable
		// box, not to the scrollable workspace — they must stay put while
		// the workspace scrolls (task Phase 3), which `position: absolute`
		// on a descendant of the SCROLLING element would not do.
		<div className="relative flex min-h-0 flex-1 flex-col">
			<div
				ref={workspaceRef}
				className={cn(
					"flex min-h-0 flex-1 items-start justify-center overflow-auto bg-[var(--editor-workspace)] p-6",
					className,
				)}
			>
				<div
					data-ak-zoom-stage
					style={{ width: stageWidth, height: stageHeight, minHeight: "100%" }}
					className="shrink-0 transition-[width,height] duration-200 motion-reduce:transition-none"
				>
					<div
						ref={frameRef}
						data-ak-canvas-frame
						style={{
							width: naturalWidth > 0 ? naturalWidth : undefined,
							// `height` (not just `minHeight`) is required: Puck's
							// own `.PuckPreview`/iframe `{ height: 100% }` chain
							// can only resolve against an ancestor with a
							// DEFINITE `height` — `min-height` alone never
							// establishes a percentage basis, so without this
							// the iframe silently collapses to the browser's
							// 150px UA default regardless of real content size.
							height: naturalHeight > 0 ? naturalHeight : undefined,
							minHeight: frameMinHeight,
							transform: `scale(${zoom})`,
							transformOrigin: "top left",
						}}
						className="flex flex-col border border-[var(--ak-studio-border)] bg-[var(--editor-canvas-frame)] transition-[width] duration-200 motion-reduce:transition-none dark:shadow-[var(--shadow-canvas)]"
					>
						<Puck.Preview />
					</div>
				</div>
			</div>
			<div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
				<CanvasHomeButton />
				<CanvasViewportSelector />
			</div>
			<CanvasZoomControls
				naturalWidth={naturalWidth}
				workspaceWidth={workspaceSize.width}
			/>
		</div>
	);
}

// Memoized so a `StudioLayout` re-render (e.g. selection toggling the
// fields panel) doesn't re-run the preview wrapper — it only re-renders
// when its own viewport / zoom store subscriptions change.
export const StudioViewportPreview = memo(StudioViewportPreviewImpl);
