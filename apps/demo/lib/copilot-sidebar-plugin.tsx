/**
 * @file Demo wiring plugin — surfaces `@anvilkit/plugin-ai-copilot` in
 * the StudioSidebar's `copilot` module.
 *
 * Core stays agnostic about any specific AI plugin; this small plugin
 * registers the panel body (`<AiPromptPanel>` + the simulate-selection
 * toggle the M9 E2E spec relies on) via `ctx.registerCopilotPanel`,
 * closing over the host's `AiCopilotPluginInstance` so the registered
 * React component can call the plugin's imperative
 * `runGeneration` / `regenerateSelection` methods directly.
 */

import type { StudioPlugin, StudioPluginMeta } from "@anvilkit/core";
import type {
	AiSectionSelection,
	StudioCopilotPanel,
	StudioSidebarUnregister,
} from "@anvilkit/core/types";
import type { AiCopilotPluginInstance } from "@anvilkit/plugin-ai-copilot";
import {
	AiPromptPanel,
	type AiPromptPanelIssue,
	type AiPromptPanelSelection,
} from "@anvilkit/ui";
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
	const [prompt, setPrompt] = useState("");
	const [status, setStatus] = useState<"idle" | "pending">("idle");
	const [error, setError] = useState<string | null>(null);
	const [issues] = useState<readonly AiPromptPanelIssue[]>([]);
	const [selectionActive, setSelectionActive] = useState(false);

	const selection: AiPromptPanelSelection | null = selectionActive
		? {
				zoneId: "root-zone",
				nodeIds: ["hero-primary"],
				nodeLabels: ["Hero"],
			}
		: null;

	async function handleGenerate(trimmed: string): Promise<void> {
		setError(null);
		setStatus("pending");
		try {
			await aiCopilotPlugin.runGeneration(trimmed);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			console.error("[demo] ai generation failed", err);
		} finally {
			setStatus("idle");
		}
	}

	async function handleRegenerate(
		trimmed: string,
		sel: AiPromptPanelSelection,
	): Promise<void> {
		setError(null);
		setStatus("pending");
		try {
			const irSelection: AiSectionSelection = {
				zoneId: sel.zoneId,
				nodeIds: sel.nodeIds,
			};
			await aiCopilotPlugin.regenerateSelection(trimmed, irSelection);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			console.error("[demo] ai section regeneration failed", err);
		} finally {
			setStatus("idle");
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<button
				type="button"
				data-testid="ai-toggle-section"
				aria-pressed={selectionActive}
				onClick={() => setSelectionActive((prev) => !prev)}
				className="self-start rounded-md border border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] px-3 py-1.5 text-xs font-medium text-[var(--ak-studio-fg)] hover:bg-[var(--ak-studio-border)]"
			>
				{selectionActive ? "Clear hero selection" : "Simulate hero selection"}
			</button>
			<AiPromptPanel
				prompt={prompt}
				onPromptChange={setPrompt}
				selection={selection}
				status={status}
				error={error}
				issues={issues}
				onGenerate={(trimmed) => {
					void handleGenerate(trimmed);
				}}
				onRegenerate={(trimmed, sel) => {
					void handleRegenerate(trimmed, sel);
				}}
			/>
			{error !== null ? (
				<p role="alert" data-testid="ai-error" style={{ display: "none" }}>
					{error}
				</p>
			) : null}
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
