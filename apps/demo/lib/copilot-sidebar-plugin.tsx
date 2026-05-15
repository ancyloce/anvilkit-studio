/**
 * @file Demo wiring plugin — surfaces `@anvilkit/plugin-ai-copilot` in
 * the StudioSidebar's `copilot` module.
 *
 * Core stays agnostic about any specific AI plugin; this small plugin
 * registers the panel body (`<AiCopilotPanel>` from the plugin's
 * `./react` subpath plus the simulate-selection toggle the M9 E2E spec
 * relies on) via `ctx.registerCopilotPanel`, closing over the host's
 * `AiCopilotPluginInstance` so the registered React component can call
 * the plugin's imperative methods directly.
 */

import type { StudioPlugin, StudioPluginMeta } from "@anvilkit/core";
import type {
	StudioCopilotPanel,
	StudioSidebarUnregister,
} from "@anvilkit/core/types";
import type { AiCopilotPluginInstance } from "@anvilkit/plugin-ai-copilot";
import { AiCopilotPanel } from "@anvilkit/plugin-ai-copilot/react";
import { Ripple } from "@anvilkit/ui";
import { Button as MotionButton } from "@anvilkit/ui/components/animate-ui/primitives/buttons/button";
import type { AiPromptPanelSelection } from "@anvilkit/ui";
import type { ReactElement } from "react";
import { useState } from "react";

interface CopilotSidebarPluginOptions {
	readonly aiCopilotPlugin: AiCopilotPluginInstance;
}

const meta: StudioPluginMeta = {
	id: "anvilkit-demo-copilot-sidebar",
	name: "Demo Copilot Sidebar",
	version: "0.0.1",
	coreVersion: "^0.1.0-alpha",
	description:
		"Registers the AI copilot prompt panel with the StudioSidebar `copilot` module.",
};

function CopilotSidebarPanel({
	aiCopilotPlugin,
}: CopilotSidebarPluginOptions): ReactElement {
	const [selectionActive, setSelectionActive] = useState(false);

	const selection: AiPromptPanelSelection | null = selectionActive
		? {
				zoneId: "root-zone",
				nodeIds: ["hero-primary"],
				nodeLabels: ["Hero"],
			}
		: null;

	return (
		<div className="flex flex-col gap-3">
			<MotionButton asChild hoverScale={1.02} tapScale={0.97}>
				<button
					type="button"
					data-testid="ai-toggle-section"
					aria-pressed={selectionActive}
					onClick={() => setSelectionActive((prev) => !prev)}
					className="relative self-start overflow-hidden rounded-md border border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] px-3 py-1.5 text-xs font-medium text-[var(--ak-studio-fg)] hover:bg-[var(--ak-studio-border)]"
				>
					<span className="relative z-10">
						{selectionActive
							? "Clear hero selection"
							: "Simulate hero selection"}
					</span>
					{selectionActive ? (
						<Ripple
							mainCircleSize={60}
							mainCircleOpacity={0.18}
							numCircles={3}
							className="opacity-40"
						/>
					) : null}
				</button>
			</MotionButton>
			{/* model id is informational only — the plugin does not yet route generation by model */}
			<AiCopilotPanel
				plugin={aiCopilotPlugin}
				selection={selection}
				brandName="Claude Cowork"
				models={[
					{ id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
					{ id: "claude-opus-4-7", label: "Opus 4.7" },
				]}
				defaultModelId="claude-sonnet-4-6"
			/>
		</div>
	);
}

export function createCopilotSidebarPlugin(
	options: CopilotSidebarPluginOptions,
): StudioPlugin {
	const panel: StudioCopilotPanel = {
		render: () => (
			<CopilotSidebarPanel aiCopilotPlugin={options.aiCopilotPlugin} />
		),
	};

	return {
		meta,
		register() {
			let unregister: StudioSidebarUnregister | null = null;
			return {
				meta,
				hooks: {
					onInit: (ctx) => {
						unregister = ctx.registerCopilotPanel?.(panel) ?? null;
					},
					onDestroy: () => {
						unregister?.();
						unregister = null;
					},
				},
			};
		},
	};
}
