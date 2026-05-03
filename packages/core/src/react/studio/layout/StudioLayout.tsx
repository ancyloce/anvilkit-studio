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
import { type ReactNode } from "react";

import { StudioHeader, type StudioHeaderProps } from "./StudioHeader.js";
import { StudioSidebar } from "./StudioSidebar.js";
import { StudioToolbar } from "./StudioToolbar.js";
import { StudioViewportPreview } from "./StudioViewportPreview.js";

export type StudioLayoutProps = StudioHeaderProps;

export function StudioLayout(props: StudioLayoutProps): ReactNode {
	return (
		<div className="flex h-screen min-h-0 flex-col bg-[var(--ak-studio-bg)] text-[var(--ak-studio-fg)]">
			<StudioHeader {...props} />
			<div className="flex min-h-0 flex-1 overflow-hidden">
				<StudioSidebar />
				<main className="flex min-w-0 flex-1 flex-col">
					<StudioToolbar />
					<StudioViewportPreview />
				</main>
				<aside className="flex w-72 shrink-0 flex-col border-l border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)]">
					<div className="overflow-auto p-3">
						<Puck.Fields />
					</div>
				</aside>
			</div>
		</div>
	);
}
