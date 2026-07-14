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
 */

import { Puck } from "@puckeditor/core";
import { memo, type ReactNode, useRef } from "react";

import { useChromeProps } from "@/context/chrome-props";
import { StudioHeader, type StudioHeaderProps } from "./StudioHeader";
import { StudioSidebarPanel, StudioSidebarRail } from "./StudioSidebar";
import { StudioToolbar } from "./StudioToolbar";
import { StudioViewportPreview } from "./StudioViewportPreview";
import type { SidebarRailHandle } from "./sidebar/SidebarRail";

export type StudioLayoutProps = StudioHeaderProps;

function StudioLayoutImpl(propOverrides: StudioLayoutProps = {}): ReactNode {
	// `<StudioLayout>` is mounted from the `puck` override slot with
	// no props (the override callback receives `{ children }` only),
	// so the header props come from `<ChromePropsProvider>` set up by
	// `<Studio>`. The optional `propOverrides` lets tests pass props
	// directly without wrapping in a provider. Save / Publish / Export
	// callbacks are now consumed inside `<PublishPanel>` directly via
	// `useChromeProps`, so the header itself only needs `onBack` and
	// the read-only `lastSavedAt` chip.
	const { onBack, lastSavedAt, headerEnd } = useChromeProps();
	const props: StudioHeaderProps = {
		onBack,
		lastSavedAt,
		headerEnd,
		...propOverrides,
	};
	const railRef = useRef<SidebarRailHandle | null>(null);
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
					headerEnd={props.headerEnd}
				/>
				<div className="flex min-h-0 flex-1 overflow-hidden">
					<StudioSidebarPanel railRef={railRef} />
					<main className="flex min-w-0 flex-1 flex-col">
						<StudioToolbar />
						<StudioViewportPreview />
					</main>
					{/*
					 * Always mounted at a fixed width (DESIGN.md §7.8: 320–360px)
					 * — `<FieldsPanel>` (the `fields` override rendered inside
					 * `<Puck.Fields>`) renders its own quiet empty state when
					 * nothing is selected, so the pane no longer disappears and
					 * reflows the canvas on every selection change.
					 */}
					<aside
						className="flex min-h-0 shrink-0 flex-col border-l border-[var(--ak-studio-border)] bg-[var(--editor-panel)]"
						style={{ inlineSize: "var(--ak-studio-inspector-width)" }}
					>
						<Puck.Fields />
					</aside>
				</div>
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
