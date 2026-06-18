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
	StudioCopilotPanel,
	StudioCopySnippetPack,
	StudioDesignSystemPanel,
	StudioHistoryPanel,
	StudioInsertSection,
	StudioLayerQuickAdd,
	StudioPageSettingsSeoFields,
	StudioSeoPanel,
	StudioSidebarUnregister,
} from "@/types/sidebar";

export interface SidebarRegistryState {
	readonly insertSections: ReadonlyMap<string, StudioInsertSection>;
	readonly layerQuickAdds: ReadonlyMap<string, StudioLayerQuickAdd>;
	readonly assetSource: StudioAssetSource | null;
	readonly assetActions: ReadonlyMap<string, StudioAssetAction>;
	readonly copyPacks: ReadonlyMap<string, StudioCopySnippetPack>;
	readonly copilotPanel: StudioCopilotPanel | null;
	readonly historyPanel: StudioHistoryPanel | null;
	readonly designSystemPanel: StudioDesignSystemPanel | null;
	readonly seoPanel: StudioSeoPanel | null;
	readonly pageSettingsSeoFields: StudioPageSettingsSeoFields | null;
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
	registerSeoPanel(panel: StudioSeoPanel): StudioSidebarUnregister;
	registerPageSettingsSeoFields(
		fields: StudioPageSettingsSeoFields,
	): StudioSidebarUnregister;
	/**
	 * Clear every contributed surface back to the empty initial state
	 * (review finding Z-g). Mainly a test/teardown convenience — the
	 * per-mount store is normally discarded with its `<Studio>` instance.
	 */
	reset(): void;
}

export type SidebarRegistryStoreApi = StoreApi<SidebarRegistryState>;

const EMPTY_INSERT = new Map<string, StudioInsertSection>();
const EMPTY_QUICK = new Map<string, StudioLayerQuickAdd>();
const EMPTY_ACTIONS = new Map<string, StudioAssetAction>();
const EMPTY_PACKS = new Map<string, StudioCopySnippetPack>();

/**
 * `NODE_ENV` via `globalThis` — mirrors `config/env-parser` and
 * `plugin-fingerprint` (core's tsconfig has no `@types/node`). Absent ⇒
 * `undefined` ⇒ treated as non-production (the warn is harmless).
 */
function nodeEnv(): string | undefined {
	return (
		globalThis as unknown as { process?: { env?: Record<string, string> } }
	).process?.env?.NODE_ENV;
}

/**
 * Dev-only warning when a second plugin overwrites a single-slot surface
 * (`assetSource` / `copilotPanel` / `historyPanel` / `designSystemPanel`).
 * Makes the documented last-write-wins contract discoverable: the loser's
 * `unregister()` silently becomes a no-op, which otherwise looks like a
 * plugin that registered fine but never takes effect. Skipped when the slot
 * already holds the *same* object (idempotent re-registration).
 */
function warnSlotOverwrite(slot: string): void {
	if (nodeEnv() === "production") {
		return;
	}
	console.warn(
		`[studio] A "${slot}" surface is already registered; overwriting it ` +
			"(last-write-wins). The previous registration's unregister() is now a " +
			"no-op — only one plugin should contribute this surface.",
	);
}

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
		copilotPanel: null,
		historyPanel: null,
		designSystemPanel: null,
		seoPanel: null,
		pageSettingsSeoFields: null,

		registerInsertSection(section) {
			set((state) => {
				const next = new Map(state.insertSections);
				next.set(section.id, section);
				return { insertSections: next };
			});
			return () => {
				const current = get().insertSections;
				if (current.get(section.id) !== section) return;
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
				if (current.get(item.id) !== item) return;
				const next = new Map(current);
				next.delete(item.id);
				set({ layerQuickAdds: next });
			};
		},

		registerAssetSource(source) {
			// `image` v1 supports a single source. Last-write-wins keeps
			// the contract simple for plugins; if a second plugin tries
			// to register one we still let it land but the previous
			// registration's `unregister()` becomes a no-op (warned in dev).
			const existing = get().assetSource;
			if (existing !== null && existing !== source) {
				warnSlotOverwrite("assetSource");
			}
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
				if (current.get(action.id) !== action) return;
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
				if (current.get(pack.id) !== pack) return;
				const next = new Map(current);
				next.delete(pack.id);
				set({ copyPacks: next });
			};
		},

		registerCopilotPanel(panel) {
			// `copilot` v1 supports a single panel. Last-write-wins
			// matches `registerAssetSource` — if a second registration
			// lands the previous registration's `unregister()` becomes a
			// no-op (warned in dev).
			const existing = get().copilotPanel;
			if (existing !== null && existing !== panel) {
				warnSlotOverwrite("copilotPanel");
			}
			set({ copilotPanel: panel });
			return () => {
				if (get().copilotPanel === panel) {
					set({ copilotPanel: null });
				}
			};
		},

		registerHistoryPanel(panel) {
			// `history` v1 supports a single panel; same last-write-wins
			// shape as `registerCopilotPanel` / `registerAssetSource`.
			const existing = get().historyPanel;
			if (existing !== null && existing !== panel) {
				warnSlotOverwrite("historyPanel");
			}
			set({ historyPanel: panel });
			return () => {
				if (get().historyPanel === panel) {
					set({ historyPanel: null });
				}
			};
		},

		registerDesignSystemPanel(panel) {
			// `design-system` v1 supports a single panel; same
			// last-write-wins shape as `registerCopilotPanel` /
			// `registerHistoryPanel`.
			const existing = get().designSystemPanel;
			if (existing !== null && existing !== panel) {
				warnSlotOverwrite("designSystemPanel");
			}
			set({ designSystemPanel: panel });
			return () => {
				if (get().designSystemPanel === panel) {
					set({ designSystemPanel: null });
				}
			};
		},

		registerSeoPanel(panel) {
			// `seo` v1 supports a single panel; same last-write-wins shape
			// as `registerDesignSystemPanel` (PRD 0004 F5).
			const existing = get().seoPanel;
			if (existing !== null && existing !== panel) {
				warnSlotOverwrite("seoPanel");
			}
			set({ seoPanel: panel });
			return () => {
				if (get().seoPanel === panel) {
					set({ seoPanel: null });
				}
			};
		},

		registerPageSettingsSeoFields(fields) {
			// Single-occupancy, last-write-wins — same shape as
			// `registerSeoPanel`. Edits any page row's stored SEO via the
			// page-settings dialog (M4), distinct from the `seo` rail panel.
			const existing = get().pageSettingsSeoFields;
			if (existing !== null && existing !== fields) {
				warnSlotOverwrite("pageSettingsSeoFields");
			}
			set({ pageSettingsSeoFields: fields });
			return () => {
				if (get().pageSettingsSeoFields === fields) {
					set({ pageSettingsSeoFields: null });
				}
			};
		},

		reset() {
			set({
				insertSections: EMPTY_INSERT,
				layerQuickAdds: EMPTY_QUICK,
				assetSource: null,
				assetActions: EMPTY_ACTIONS,
				copyPacks: EMPTY_PACKS,
				copilotPanel: null,
				historyPanel: null,
				designSystemPanel: null,
				seoPanel: null,
				pageSettingsSeoFields: null,
			});
		},
	}));
}
