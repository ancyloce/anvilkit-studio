/**
 * @file `<StudioLayout>` — 3-pane chrome shell.
 *
 * Bound to Puck's `puck` override slot in Phase 5: when a consumer
 * sets `chrome="anvilkit"`, `<Studio>` registers a `puck` override
 * whose render function returns this layout. The default Puck
 * `{children}` (the canvas surface) is rendered inside the center
 * pane via `<Puck.Preview>`. The sidebars use
 * `<Puck.Components>` / `<Puck.Outline>` / `<Puck.Fields>` so the
 * actual content stays Puck-native.
 *
 * The `children` prop received from Puck is intentionally **not
 * rendered**: when `chrome="anvilkit"`, the layout is the chrome,
 * and we drive the canvas through the compound exports instead. The
 * Phase 5 wiring will add a `<PuckApiBinder>` outside this component
 * so plugin context still works.
 *
 * ### Resizable / collapsible panels + Focus Mode (task Phase 5)
 *
 * The left panel and inspector sit inside a `react-resizable-panels`
 * `Group` (the library was already a dependency with an unused wrapper
 * at `studio/primitives/resizable.tsx` — this is the first call site).
 * The rail is deliberately OUTSIDE the group (its width never changes).
 *
 * - Left panel: collapse stays exactly as it was pre-Phase-5
 *   (`drawerCollapsed`, toggled by the rail / the panel's own close
 *   button / `Esc`) — collapsing still fully unmounts `<StudioSidebarPanel>`,
 *   so it is conditionally included in the `Group`'s children rather than
 *   using the library's `collapsible` prop.
 * - Inspector: MUST stay always-mounted (pre-existing invariant — see the
 *   comment on the `<Puck.Fields>` panel below), so it uses the library's
 *   own `collapsible` + `collapsedSize={0}` + imperative `panelRef`
 *   instead of conditional rendering. `inspectorCollapsed` syncs
 *   bidirectionally: a store-driven toggle calls `.collapse()`/`.expand()`;
 *   dragging the handle to 0 reports back through `onResize`.
 * - Focus Mode is a session-only viewing override (not persisted, see
 *   `editor-ui-store.ts`): while active, both panels render hidden
 *   regardless of their individually stored collapsed/width state, and
 *   turning it off restores whatever was there before.
 * - Both side panels use `groupResizeBehavior="preserve-pixel-size"` so a
 *   browser-window resize only grows/shrinks the canvas panel (which
 *   keeps the default `"preserve-relative-size"` behavior) — DESIGN.md
 *   §1.3: opening/resizing a panel never changes the canvas's configured
 *   breakpoint, only the space available to it.
 */

import { Puck } from "@puckeditor/core";
import { memo, type ReactNode, useCallback, useEffect, useRef } from "react";
import type { PanelImperativeHandle, PanelSize } from "react-resizable-panels";
import { useChromeProps } from "@/context/chrome-props";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/primitives/resizable";
import {
	useDrawerCollapsed,
	useFocusMode,
	useInspectorCollapsed,
	useInspectorWidth,
	useLeftPanelWidth,
} from "@/state/slices/editor-ui-selectors";
import {
	INSPECTOR_MAX_WIDTH,
	INSPECTOR_MIN_WIDTH,
	LEFT_PANEL_MAX_WIDTH,
	LEFT_PANEL_MIN_WIDTH,
} from "@/state/slices/editor-ui-store";
import { StudioHeader, type StudioHeaderProps } from "./StudioHeader";
import { StudioSidebarPanel, StudioSidebarRail } from "./StudioSidebar";
import { StudioViewportPreview } from "./StudioViewportPreview";
import type { SidebarRailHandle } from "./sidebar/SidebarRail";

export type StudioLayoutProps = StudioHeaderProps;

/** Minimum usable canvas viewport (DESIGN.md §6). */
const CANVAS_PANEL_MIN_WIDTH = 720;

function StudioLayoutImpl(propOverrides: StudioLayoutProps = {}): ReactNode {
	// `<StudioLayout>` is mounted from the `puck` override slot with
	// no props (the override callback receives `{ children }` only),
	// so the header props come from `<ChromePropsProvider>` set up by
	// `<Studio>`. The optional `propOverrides` lets tests pass props
	// directly without wrapping in a provider. Save / Publish / Export
	// callbacks are now consumed inside `<PublishPanel>` directly via
	// `useChromeProps`, so the header itself only needs `onBack`, the
	// read-only save-status inputs, and `headerEnd`.
	const { onBack, lastSavedAt, isSavingDraft, saveError, headerEnd } =
		useChromeProps();
	const props: StudioHeaderProps = {
		onBack,
		lastSavedAt,
		isSavingDraft,
		saveError,
		headerEnd,
		...propOverrides,
	};
	const railRef = useRef<SidebarRailHandle | null>(null);
	const inspectorPanelRef = useRef<PanelImperativeHandle | null>(null);

	const [focusMode] = useFocusMode();
	const [drawerCollapsed] = useDrawerCollapsed();
	const [leftPanelWidth, setLeftPanelWidth] = useLeftPanelWidth();
	const [inspectorWidth, setInspectorWidth] = useInspectorWidth();
	const [inspectorCollapsed, setInspectorCollapsed] = useInspectorCollapsed();

	const showLeftPanel = !focusMode && !drawerCollapsed;
	const inspectorEffectivelyCollapsed = focusMode || inspectorCollapsed;

	// Sync store-driven collapse (Focus Mode toggling, or a future
	// explicit inspector collapse control) to the panel's imperative
	// API. Drag-to-collapse is handled the other way, in `onResize`
	// below — the panel itself is the source of truth for "what's
	// currently painted," this effect only reacts to state changes
	// that did NOT originate from a drag.
	useEffect(() => {
		const panel = inspectorPanelRef.current;
		if (panel === null) return;
		if (inspectorEffectivelyCollapsed && !panel.isCollapsed()) {
			panel.collapse();
		} else if (!inspectorEffectivelyCollapsed && panel.isCollapsed()) {
			panel.expand();
		}
	}, [inspectorEffectivelyCollapsed]);

	const handleLeftPanelResize = useCallback(
		(
			panelSize: PanelSize,
			_id: unknown,
			prevPanelSize: PanelSize | undefined,
		) => {
			// Skip the mount-time call (`prevPanelSize` is `undefined` only
			// on mount) so restoring a persisted width doesn't immediately
			// re-persist the same value right back.
			if (prevPanelSize === undefined) return;
			setLeftPanelWidth(panelSize.inPixels);
		},
		[setLeftPanelWidth],
	);

	const handleInspectorResize = useCallback(
		(
			panelSize: PanelSize,
			_id: unknown,
			prevPanelSize: PanelSize | undefined,
		) => {
			if (prevPanelSize === undefined) return;
			if (panelSize.inPixels <= 0) {
				setInspectorCollapsed(true);
				return;
			}
			setInspectorCollapsed(false);
			setInspectorWidth(panelSize.inPixels);
		},
		[setInspectorCollapsed, setInspectorWidth],
	);

	return (
		<div
			data-ak-studio-root
			className="flex h-screen min-h-0 text-[var(--ak-studio-fg)]"
		>
			<StudioSidebarRail railRef={railRef} />
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				{/* Discrete props (not a spread object literal) so the
				    `memo`'d `StudioHeader` boundary holds across this
				    layout's re-renders. */}
				<StudioHeader
					onBack={props.onBack}
					lastSavedAt={props.lastSavedAt}
					isSavingDraft={props.isSavingDraft}
					saveError={props.saveError}
					headerEnd={props.headerEnd}
				/>
				<ResizablePanelGroup
					orientation="horizontal"
					className="min-h-0 flex-1 overflow-hidden"
				>
					{showLeftPanel ? (
						<>
							<ResizablePanel
								id="ak-left-panel"
								defaultSize={leftPanelWidth}
								minSize={LEFT_PANEL_MIN_WIDTH}
								maxSize={LEFT_PANEL_MAX_WIDTH}
								groupResizeBehavior="preserve-pixel-size"
								onResize={handleLeftPanelResize}
							>
								<StudioSidebarPanel railRef={railRef} />
							</ResizablePanel>
							<ResizableHandle />
						</>
					) : null}
					<ResizablePanel id="ak-canvas-panel" minSize={CANVAS_PANEL_MIN_WIDTH}>
						<main className="flex h-full min-w-0 flex-col">
							<StudioViewportPreview />
						</main>
					</ResizablePanel>
					<ResizableHandle />
					{/*
					 * Always mounted (DESIGN.md §7.8: 320–360px) — `<FieldsPanel>`
					 * (the `fields` override rendered inside `<Puck.Fields>`)
					 * renders its own quiet empty state when nothing is selected,
					 * so the pane no longer disappears and reflows the canvas on
					 * every selection change. Collapse is expressed via the
					 * panel's own `collapsedSize={0}`, not conditional rendering,
					 * to preserve that invariant.
					 */}
					<ResizablePanel
						id="ak-inspector-panel"
						panelRef={inspectorPanelRef}
						defaultSize={inspectorEffectivelyCollapsed ? 0 : inspectorWidth}
						minSize={INSPECTOR_MIN_WIDTH}
						maxSize={INSPECTOR_MAX_WIDTH}
						collapsible
						collapsedSize={0}
						groupResizeBehavior="preserve-pixel-size"
						onResize={handleInspectorResize}
						className="flex flex-col border-l border-[var(--ak-studio-border)] bg-[var(--editor-panel)]"
					>
						<Puck.Fields />
					</ResizablePanel>
				</ResizablePanelGroup>
			</div>
		</div>
	);
}

// Memoized so Puck re-rendering the `puck` override slot doesn't force a
// layout re-render on unrelated parent updates. Selection changes no longer
// re-render this component at all — the inspector `<aside>` is always
// mounted, and `<FieldsPanel>` (rendered inside `<Puck.Fields>`) owns its
// own selection subscription via `useBreadcrumbs()`.
export const StudioLayout = memo(StudioLayoutImpl);
