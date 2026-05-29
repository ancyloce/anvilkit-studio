/**
 * Version-history sidebar plugin pair for the docs playground.
 *
 * Ported from `apps/demo/lib/history-sidebar-plugin.tsx`. The single
 * factory `createDemoVersionHistoryPlugins` returns:
 *   - `versionHistoryPlugin` — the headless `@anvilkit/plugin-version-history`
 *     plugin (header actions + save/open events).
 *   - `sidebarPlugin` — a thin registration that renders `<VersionHistoryUI>`
 *     in the StudioSidebar's `history` module.
 *   - `adapter` — the shared `SnapshotAdapter` (localStorage-backed).
 */

import type { StudioPlugin, StudioPluginMeta } from "@anvilkit/core";
import type {
	StudioHistoryPanel,
	StudioSidebarUnregister,
} from "@anvilkit/core/types";
import { irToPuckData, puckDataToIR } from "@anvilkit/ir";
import {
	createVersionHistoryPlugin,
	localStorageAdapter,
	type SnapshotAdapter,
} from "@anvilkit/plugin-version-history";
import { VersionHistoryUI } from "@anvilkit/plugin-version-history/ui";
import { type Config, createUsePuck, type Data } from "@puckeditor/core";
import { type ReactElement, useMemo } from "react";

const useStudioPuck = createUsePuck();

export interface CreateDemoVersionHistoryPluginsOptions {
	readonly puckConfig: Config;
	readonly adapter?: SnapshotAdapter;
	readonly namespace?: string;
	readonly maxSnapshots?: number;
}

export interface DemoVersionHistoryPlugins {
	readonly versionHistoryPlugin: StudioPlugin;
	readonly sidebarPlugin: StudioPlugin;
	readonly adapter: SnapshotAdapter;
}

const META: StudioPluginMeta = {
	id: "anvilkit-docs-history-sidebar",
	name: "Version History Sidebar",
	version: "0.0.1",
	coreVersion: "^0.1.0-alpha",
	description:
		"Registers @anvilkit/plugin-version-history's UI with the StudioSidebar `history` module.",
};

interface HistorySidebarPanelProps {
	readonly adapter: SnapshotAdapter;
	readonly puckConfig: Config;
}

function HistorySidebarPanel({
	adapter,
	puckConfig,
}: HistorySidebarPanelProps): ReactElement {
	const data = useStudioPuck((s) => s.appState.data) as Data;
	const dispatch = useStudioPuck((s) => s.dispatch);

	const currentIR = useMemo(
		() => puckDataToIR(data, puckConfig),
		[data, puckConfig],
	);

	return (
		<div data-testid="ak-history-panel" className="flex flex-col gap-3">
			<VersionHistoryUI
				adapter={adapter}
				currentIR={currentIR}
				onRestore={(ir) => {
					dispatch({ type: "setData", data: irToPuckData(ir) });
				}}
			/>
		</div>
	);
}

export function createDemoVersionHistoryPlugins(
	options: CreateDemoVersionHistoryPluginsOptions,
): DemoVersionHistoryPlugins {
	const adapter =
		options.adapter ??
		localStorageAdapter({
			namespace: options.namespace ?? "anvilkit-playground-version-history",
		});

	const versionHistoryPlugin = createVersionHistoryPlugin({
		adapter,
		maxSnapshots: options.maxSnapshots ?? 50,
	});

	const panel: StudioHistoryPanel = {
		render: () => (
			<HistorySidebarPanel adapter={adapter} puckConfig={options.puckConfig} />
		),
	};

	const sidebarPlugin: StudioPlugin = {
		meta: META,
		register() {
			let unregister: StudioSidebarUnregister | null = null;
			return {
				meta: META,
				hooks: {
					onInit: (ctx) => {
						unregister = ctx.registerHistoryPanel?.(panel) ?? null;
					},
					onDestroy: () => {
						unregister?.();
						unregister = null;
					},
				},
			};
		},
	};

	return { versionHistoryPlugin, sidebarPlugin, adapter };
}
