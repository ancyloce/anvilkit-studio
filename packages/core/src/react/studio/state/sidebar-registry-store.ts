/**
 * @file Per-instance registry of plugin-contributed sidebar surfaces.
 *
 * Each `<Studio>` mount owns its own registry so two editors on the
 * same page register independently. The store holds:
 *
 * - `insertSections` — Map of {@link StudioInsertSection}, keyed by id.
 * - `layerQuickAdds` — Map of {@link StudioLayerQuickAdd}, keyed by id.
 * - `assetSource`    — The single `StudioAssetSource` registered by
 *   the asset-manager plugin (last-write-wins; the store warns if a
 *   second plugin tries to register one).
 * - `assetActions`   — Map of {@link StudioAssetAction}, keyed by id.
 * - `copyPacks`      — Map of {@link StudioCopySnippetPack}, keyed by id.
 *
 * Each `register*` action returns an `unregister()` handle that
 * removes the entry. Plugins should collect those in their
 * `register()` body and call them from `onDestroy` so a remount with
 * a different plugin set never carries over stale surfaces.
 *
 * Stored as Zustand vanilla so the runtime layer of `<Studio>` can
 * read it without going through the React store hook (the same
 * pattern `editor-ui-store` uses).
 */

import { createStore, type StoreApi } from "zustand/vanilla";

import type {
	StudioAssetAction,
	StudioAssetSource,
	StudioCopySnippetPack,
	StudioInsertSection,
	StudioLayerQuickAdd,
	StudioSidebarUnregister,
} from "../../../types/sidebar";

export interface SidebarRegistryState {
	readonly insertSections: ReadonlyMap<string, StudioInsertSection>;
	readonly layerQuickAdds: ReadonlyMap<string, StudioLayerQuickAdd>;
	readonly assetSource: StudioAssetSource | null;
	readonly assetActions: ReadonlyMap<string, StudioAssetAction>;
	readonly copyPacks: ReadonlyMap<string, StudioCopySnippetPack>;
	registerInsertSection(section: StudioInsertSection): StudioSidebarUnregister;
	registerLayerQuickAdd(item: StudioLayerQuickAdd): StudioSidebarUnregister;
	registerAssetSource(source: StudioAssetSource): StudioSidebarUnregister;
	registerAssetAction(action: StudioAssetAction): StudioSidebarUnregister;
	registerCopySnippetPack(pack: StudioCopySnippetPack): StudioSidebarUnregister;
}

export type SidebarRegistryStoreApi = StoreApi<SidebarRegistryState>;

const EMPTY_INSERT = new Map<string, StudioInsertSection>();
const EMPTY_QUICK = new Map<string, StudioLayerQuickAdd>();
const EMPTY_ACTIONS = new Map<string, StudioAssetAction>();
const EMPTY_PACKS = new Map<string, StudioCopySnippetPack>();

/**
 * Build a fresh per-instance registry store. The provider creates one
 * per `<Studio>` mount and threads it into the plugin context so
 * `register()` calls from plugins land in the right place.
 */
export function createSidebarRegistryStore(): SidebarRegistryStoreApi {
	return createStore<SidebarRegistryState>((set, get) => ({
		insertSections: EMPTY_INSERT,
		layerQuickAdds: EMPTY_QUICK,
		assetSource: null,
		assetActions: EMPTY_ACTIONS,
		copyPacks: EMPTY_PACKS,

		registerInsertSection(section) {
			set((state) => {
				const next = new Map(state.insertSections);
				next.set(section.id, section);
				return { insertSections: next };
			});
			return () => {
				const current = get().insertSections;
				if (!current.has(section.id)) return;
				const next = new Map(current);
				next.delete(section.id);
				set({ insertSections: next });
			};
		},

		registerLayerQuickAdd(item) {
			set((state) => {
				const next = new Map(state.layerQuickAdds);
				next.set(item.id, item);
				return { layerQuickAdds: next };
			});
			return () => {
				const current = get().layerQuickAdds;
				if (!current.has(item.id)) return;
				const next = new Map(current);
				next.delete(item.id);
				set({ layerQuickAdds: next });
			};
		},

		registerAssetSource(source) {
			// `image` v1 supports a single source. Last-write-wins keeps
			// the contract simple for plugins; if a second plugin tries
			// to register one we still let it land but the previous
			// registration's `unregister()` becomes a no-op.
			set({ assetSource: source });
			return () => {
				if (get().assetSource === source) {
					set({ assetSource: null });
				}
			};
		},

		registerAssetAction(action) {
			set((state) => {
				const next = new Map(state.assetActions);
				next.set(action.id, action);
				return { assetActions: next };
			});
			return () => {
				const current = get().assetActions;
				if (!current.has(action.id)) return;
				const next = new Map(current);
				next.delete(action.id);
				set({ assetActions: next });
			};
		},

		registerCopySnippetPack(pack) {
			set((state) => {
				const next = new Map(state.copyPacks);
				next.set(pack.id, pack);
				return { copyPacks: next };
			});
			return () => {
				const current = get().copyPacks;
				if (!current.has(pack.id)) return;
				const next = new Map(current);
				next.delete(pack.id);
				set({ copyPacks: next });
			};
		},
	}));
}
