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
	StudioPluginContext,
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

interface CopilotSidebarPanelProps extends CopilotSidebarPluginOptions {
	/**
	 * Live Puck-data accessor. The "Simulate selection" toggle must pin a
	 * node that is *currently* on the canvas — after a page generation or
	 * a multi-page swap the seeded `hero-primary` may be gone entirely.
	 * Pinning a non-existent id made regenerate-selection throw
	 * `APPLY_FAILED` (the canvas had no such node to patch). Throws before
	 * the plugin's `onInit` runs; {@link resolveSelectionTarget} treats
	 * that as "no resolvable selection yet".
	 */
	readonly getData: () => ReturnType<StudioPluginContext["getData"]>;
}

const HERO_TYPE = "Hero";

interface SelectionTarget {
	readonly id: string;
	readonly label: string;
}

/**
 * Resolve a section-selection target that is *guaranteed to exist* on
 * the live canvas. Prefers the first Hero (the demo's canonical
 * section), but falls back to the first top-level node of any type so
 * the toggle still targets a real, contiguous root node on pages that
 * have no Hero (e.g. the multi-page sidebar's `items` / `list`
 * layouts). Returns `null` when the canvas is empty or unavailable —
 * the panel then stays in page mode instead of pinning a node that
 * isn't there.
 */
function resolveSelectionTarget(
	getData: CopilotSidebarPanelProps["getData"],
): SelectionTarget | null {
	let data: ReturnType<StudioPluginContext["getData"]>;
	try {
		data = getData();
	} catch {
		return null;
	}
	const content = (data?.content ?? []) as ReadonlyArray<{
		type?: string;
		props?: { id?: unknown };
	}>;
	let firstNode: SelectionTarget | null = null;
	for (const item of content) {
		if (typeof item.props?.id !== "string") continue;
		const target: SelectionTarget = {
			id: item.props.id,
			label: item.type ?? "Section",
		};
		// Prefer a Hero so the demo's canonical "regenerate the hero" flow
		// still resolves to it whenever one is present.
		if (item.type === HERO_TYPE) return target;
		firstNode ??= target;
	}
	return firstNode;
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
	getData,
}: CopilotSidebarPanelProps): ReactElement {
	const [selectionActive, setSelectionActive] = useState(false);

	const target = selectionActive ? resolveSelectionTarget(getData) : null;
	const selection: AiPromptPanelSelection | null = target
		? {
				zoneId: "root-zone",
				nodeIds: [target.id],
				nodeLabels: [target.label],
			}
		: null;

	return (
		<div className="flex h-full flex-col gap-3">
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
							? "Clear section selection"
							: "Simulate section selection"}
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
				brandName="Pagix Ai Copilot"
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
	let ctxRef: StudioPluginContext | null = null;
	const getLiveData = (): ReturnType<StudioPluginContext["getData"]> => {
		if (!ctxRef) {
			throw new Error("copilot-sidebar-plugin: getData before onInit");
		}
		return ctxRef.getData();
	};
	const panel: StudioCopilotPanel = {
		render: () => (
			<CopilotSidebarPanel
				aiCopilotPlugin={options.aiCopilotPlugin}
				getData={getLiveData}
			/>
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
						ctxRef = ctx;
						unregister = ctx.registerCopilotPanel?.(panel) ?? null;
					},
					onDestroy: () => {
						unregister?.();
						unregister = null;
						ctxRef = null;
					},
				},
			};
		},
	};
}
