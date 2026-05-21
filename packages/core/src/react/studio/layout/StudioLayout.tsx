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

import { createUsePuck, Puck } from "@puckeditor/core";
import { type ReactNode, useRef } from "react";

import { useChromeProps } from "@/context/chrome-props";
import { StudioHeader, type StudioHeaderProps } from "./StudioHeader";
import { StudioSidebarPanel, StudioSidebarRail } from "./StudioSidebar";
import { StudioToolbar } from "./StudioToolbar";
import { StudioViewportPreview } from "./StudioViewportPreview";
import type { SidebarRailHandle } from "./sidebar/SidebarRail";

export type StudioLayoutProps = StudioHeaderProps;

const useStudioPuck = createUsePuck();

export function StudioLayout(propOverrides: StudioLayoutProps = {}): ReactNode {
	// `<StudioLayout>` is mounted from the `puck` override slot with
	// no props (the override callback receives `{ children }` only),
	// so the header props come from `<ChromePropsProvider>` set up by
	// `<Studio>`. The optional `propOverrides` lets tests pass props
	// directly without wrapping in a provider. Save / Publish / Export
	// callbacks are now consumed inside `<PublishPanel>` directly via
	// `useChromeProps`, so the header itself only needs `onBack` and
	// the read-only `lastSavedAt` chip.
	const { onBack, lastSavedAt, collaboratorsSlot } = useChromeProps();
	const props: StudioHeaderProps = {
		onBack,
		lastSavedAt,
		collaboratorsSlot,
		...propOverrides,
	};
	const hasSelection = useStudioPuck(
		(state) => state.appState.ui.itemSelector !== null,
	);
	const railRef = useRef<SidebarRailHandle | null>(null);
	return (
		<div
			data-ak-studio-root
			className="flex h-screen min-h-0 text-[var(--ak-studio-fg)]"
		>
			<StudioSidebarRail railRef={railRef} />
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				<StudioHeader {...props} />
				<div className="flex min-h-0 flex-1 overflow-hidden">
					<StudioSidebarPanel railRef={railRef} />
					<main className="flex min-w-0 flex-1 flex-col">
						<StudioToolbar />
						<StudioViewportPreview />
					</main>
					{hasSelection ? (
						<aside className="flex w-72 shrink-0 flex-col border-l border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)]">
							<div className="overflow-auto">
								<Puck.Fields />
							</div>
						</aside>
					) : null}
				</div>
			</div>
		</div>
	);
}
