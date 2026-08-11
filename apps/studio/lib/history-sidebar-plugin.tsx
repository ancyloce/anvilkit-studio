/**
 * @file Demo wiring plugin pair — surfaces `@anvilkit/plugin-version-history`
 * in the StudioSidebar's `history` module while sharing one
 * `SnapshotAdapter` with the plugin's header-action save flow.
 *
 * The single factory `createDemoVersionHistoryPlugins` returns:
 *   - `versionHistoryPlugin` — the headless plugin that contributes
 *     header actions and emits `version-history:save-requested` /
 *     `version-history:open-requested` events.
 *   - `sidebarPlugin` — a thin demo-side adapter that registers a
 *     `StudioHistoryPanel` rendering `<VersionHistoryUI>`.
 *   - `adapter` — the shared `SnapshotAdapter` instance.
 *
 * Mirrors `apps/studio/lib/copilot-sidebar-plugin.tsx` for shape, and
 * follows the "consolidate integration surface, not packages" pattern
 * (one factory in the demo, rather than splitting into multiple
 * exports).
 *
 * Reactivity: the panel reads current Puck data through `createUsePuck()`
 * resolved against the demo's `@puckeditor/core` copy — the same
 * workaround `collab-studio-plugin.tsx` uses to dodge the dual-puck
 * issue when a plugin submodule pulls in its own peer-dep copy.
 *
 * ## Restore reads canonical documents (`p6-004`)
 *
 * A snapshot is a `PageIR`, and restore is the one place a document
 * re-enters the editor from outside the store. What the editor gets
 * back must render identically to what was snapshotted, so the two
 * transforms in that path were measured rather than assumed
 * (2026-08-10, against the repo's own `dist`):
 *
 * - `puckDataToIR` → `irToPuckData` preserves every **render-affecting**
 *   carrier — per-node `appearance` including responsive overrides,
 *   `designSystem` and `componentLibrary` on root — and
 *   `compileDocumentAppearance` emits byte-identical CSS before and
 *   after the round trip.
 * - It does **not** preserve `editorAnnotations`: `p3-006` strips that
 *   key at the single IR boundary every export format crosses
 *   (`packages/foundation/ir/src/puck-data-to-ir.ts:334`), and the
 *   snapshot format crosses it too. Annotations are editor state
 *   *about* nodes rather than render state *of* them, so a restored
 *   page still renders identically — it comes back with its author-given
 *   layer names cleared. Recorded as a known gap, not fixed here:
 *   changing what the IR boundary emits is an `@anvilkit/ir` decision,
 *   not an app one.
 *
 * ### Both document shapes, through the tolerant parse — closes in `p7-002`
 *
 * Until the store migration runs, two shapes can arrive: a snapshot
 * written before the carrier cutover (sidecar form) and a canonical
 * one, the latter possibly carrying stale `version` keys that the
 * `looseObject` schemas preserve and nothing reads. Both are admitted
 * — the canonical one unchanged, the pre-carrier one migrated on read
 * — and neither is admitted by branching on a version field. This
 * tolerance is **time-boxed**: `p7-002` migrates the stored snapshots
 * and closes it, and `p7-004` deletes the guard entirely. See
 * `./migration/v2-guard.ts` for why the routing marker has to survive
 * that long.
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
import { type ReactElement, useCallback, useMemo, useState } from "react";
import { guardDocumentForV2Editor } from "./migration/v2-guard";

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
	id: "anvilkit-demo-history-sidebar",
	name: "Demo Version History Sidebar",
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
	const [restoreError, setRestoreError] = useState<string | null>(null);

	const currentIR = useMemo(
		() => puckDataToIR(data, puckConfig),
		[data, puckConfig],
	);

	const handleRestore = useCallback(
		(ir: Parameters<typeof irToPuckData>[0]): void => {
			// One admission point for both shapes (see the file doc). The
			// guard classifies; it never branches on a version field here.
			const admitted = guardDocumentForV2Editor(
				irToPuckData(ir) as Data,
				puckConfig,
			);

			if (admitted.kind === "blocked") {
				// A refusal the author cannot see is indistinguishable from
				// a restore that silently did nothing, so it is surfaced in
				// the panel as well as logged.
				const detail =
					admitted.diagnostics
						.filter((diagnostic) => diagnostic.severity === "error")
						.map((diagnostic) => diagnostic.message)
						.join(" ") || "the snapshot failed validation.";
				setRestoreError(`Restore refused — ${detail}`);
				console.error(
					"[demo] restore refused — this snapshot cannot enter the editor",
					admitted.diagnostics,
				);
				return;
			}

			setRestoreError(null);
			if (admitted.kind === "migrated" && admitted.convertedLegacyState) {
				// The time-boxed shape: a pre-carrier snapshot converted on
				// read, in memory only. `p7-002` migrates the stored
				// snapshots and this branch stops being reachable.
				console.info(
					"[demo] pre-carrier snapshot converted on restore",
					admitted.diagnostics,
				);
			} else {
				// The canonical shape. Note that it arrives under BOTH kinds
				// today — `"ok"` for a snapshot carrying the routing marker,
				// `"migrated"` with nothing converted for one without it —
				// which is the marker-driven classification `v2-guard.ts`
				// documents and `p7-002` retires.
				console.info("[demo] canonical snapshot restored");
			}
			dispatch({ type: "setData", data: admitted.data });
		},
		[dispatch, puckConfig],
	);

	return (
		<div data-testid="ak-history-panel" className="flex flex-col gap-3">
			{restoreError === null ? null : (
				<p
					role="alert"
					data-testid="ak-history-restore-error"
					className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-destructive text-xs"
				>
					{restoreError}
				</p>
			)}
			<VersionHistoryUI
				adapter={adapter}
				currentIR={currentIR}
				onRestore={handleRestore}
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
			namespace: options.namespace ?? "anvilkit-demo-version-history",
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
