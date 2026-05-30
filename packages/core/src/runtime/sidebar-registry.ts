/**
 * @file `sidebar-registry` — a React-free registry that collects the
 * plugin-contributed sidebar surfaces during {@link compilePlugins}.
 *
 * Review finding **AR-b**: the eight `register*` sidebar methods on
 * {@link StudioPluginContext} previously landed only in the React-layer
 * `sidebar-registry-store`, so headless consumers of a compiled
 * {@link StudioRuntime} (the CLI exporter, the `@anvilkit/core/testing`
 * harness) saw no-ops. This module gives the runtime layer its own
 * collection — exactly the shape `assetResolvers` already had — so the
 * compiled runtime exposes the contributions directly (`runtime.sidebar`).
 *
 * The React store remains the live, reactive view the chrome renders
 * from; `compilePlugins` dual-records into both (mirroring the
 * `assetResolvers` push-then-delegate pattern), so the runtime registry
 * and the React store stay in lock-step with identical
 * last-write-wins / identity-checked-unregister semantics.
 *
 * React-free: only type-only imports from `@/types/sidebar` (whose
 * `ReactNode` references erase under `verbatimModuleSyntax`). The
 * `render()` thunks on panel contributions are stored opaquely and
 * never invoked here — the React boundary owns instantiation.
 */

import type {
	StudioAssetAction,
	StudioAssetSource,
	StudioCopilotPanel,
	StudioCopySnippetPack,
	StudioDesignSystemPanel,
	StudioHistoryPanel,
	StudioInsertSection,
	StudioLayerQuickAdd,
	StudioSidebarUnregister,
} from "@/types/sidebar";

/**
 * Immutable snapshot of every sidebar contribution collected during a
 * single {@link compilePlugins} pass, exposed on
 * {@link StudioRuntime.sidebar}. Map-keyed surfaces are last-write-wins
 * by id; the single-occupancy panels/source are last-write-wins by
 * registration order.
 */
export interface StudioSidebarContributions {
	readonly insertSections: ReadonlyMap<string, StudioInsertSection>;
	readonly layerQuickAdds: ReadonlyMap<string, StudioLayerQuickAdd>;
	readonly assetSource: StudioAssetSource | null;
	readonly assetActions: ReadonlyMap<string, StudioAssetAction>;
	readonly copyPacks: ReadonlyMap<string, StudioCopySnippetPack>;
	readonly copilotPanel: StudioCopilotPanel | null;
	readonly historyPanel: StudioHistoryPanel | null;
	readonly designSystemPanel: StudioDesignSystemPanel | null;
}

/**
 * Mutable collector with the same eight `register*` methods the React
 * store exposes (each returning an identity-checked `unregister()`),
 * plus {@link snapshot} to freeze the current contributions for the
 * compiled runtime.
 */
export interface SidebarRegistry {
	registerInsertSection(section: StudioInsertSection): StudioSidebarUnregister;
	registerLayerQuickAdd(item: StudioLayerQuickAdd): StudioSidebarUnregister;
	registerAssetSource(source: StudioAssetSource): StudioSidebarUnregister;
	registerAssetAction(action: StudioAssetAction): StudioSidebarUnregister;
	registerCopySnippetPack(pack: StudioCopySnippetPack): StudioSidebarUnregister;
	registerCopilotPanel(panel: StudioCopilotPanel): StudioSidebarUnregister;
	registerHistoryPanel(panel: StudioHistoryPanel): StudioSidebarUnregister;
	registerDesignSystemPanel(
		panel: StudioDesignSystemPanel,
	): StudioSidebarUnregister;
	/** Freeze the current contributions into an immutable snapshot. */
	snapshot(): StudioSidebarContributions;
}

/**
 * Build a fresh runtime sidebar registry. `compilePlugins` creates one
 * per compile pass and threads its `register*` methods into the plugin
 * context.
 */
export function createSidebarRegistry(): SidebarRegistry {
	const insertSections = new Map<string, StudioInsertSection>();
	const layerQuickAdds = new Map<string, StudioLayerQuickAdd>();
	const assetActions = new Map<string, StudioAssetAction>();
	const copyPacks = new Map<string, StudioCopySnippetPack>();
	let assetSource: StudioAssetSource | null = null;
	let copilotPanel: StudioCopilotPanel | null = null;
	let historyPanel: StudioHistoryPanel | null = null;
	let designSystemPanel: StudioDesignSystemPanel | null = null;

	return {
		registerInsertSection(section) {
			insertSections.set(section.id, section);
			return () => {
				if (insertSections.get(section.id) === section) {
					insertSections.delete(section.id);
				}
			};
		},
		registerLayerQuickAdd(item) {
			layerQuickAdds.set(item.id, item);
			return () => {
				if (layerQuickAdds.get(item.id) === item) {
					layerQuickAdds.delete(item.id);
				}
			};
		},
		registerAssetSource(source) {
			// Single-occupancy, last-write-wins (mirrors the React store).
			assetSource = source;
			return () => {
				if (assetSource === source) {
					assetSource = null;
				}
			};
		},
		registerAssetAction(action) {
			assetActions.set(action.id, action);
			return () => {
				if (assetActions.get(action.id) === action) {
					assetActions.delete(action.id);
				}
			};
		},
		registerCopySnippetPack(pack) {
			copyPacks.set(pack.id, pack);
			return () => {
				if (copyPacks.get(pack.id) === pack) {
					copyPacks.delete(pack.id);
				}
			};
		},
		registerCopilotPanel(panel) {
			copilotPanel = panel;
			return () => {
				if (copilotPanel === panel) {
					copilotPanel = null;
				}
			};
		},
		registerHistoryPanel(panel) {
			historyPanel = panel;
			return () => {
				if (historyPanel === panel) {
					historyPanel = null;
				}
			};
		},
		registerDesignSystemPanel(panel) {
			designSystemPanel = panel;
			return () => {
				if (designSystemPanel === panel) {
					designSystemPanel = null;
				}
			};
		},
		snapshot() {
			return {
				insertSections: new Map(insertSections),
				layerQuickAdds: new Map(layerQuickAdds),
				assetSource,
				assetActions: new Map(assetActions),
				copyPacks: new Map(copyPacks),
				copilotPanel,
				historyPanel,
				designSystemPanel,
			};
		},
	};
}
