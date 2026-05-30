/**
 * @file Per-instance editor UI store factory.
 *
 * Each `<Studio>` instance gets its own Zustand vanilla store so two
 * editors mounted on the same page never share UI state. The factory
 * is the only public construction path; consumers reach the store via
 * the `EditorUiStoreProvider` context, never by importing the factory
 * directly.
 *
 * ### Persistence
 *
 * The store persists under `anvilkit-ui-${storeId}` in `localStorage`.
 * `drawerSearch` is intentionally **excluded** from persistence: it's
 * a transient input and re-hydrating it across sessions surprises
 * users with stale filter state on a fresh load. Hydration is
 * deferred (`skipHydration: true`) so SSR never touches storage; the
 * React provider triggers `rehydrate()` from a mount-time effect.
 *
 * ### State slice
 *
 * Existing fields:
 * - `activeTab` — sidebar module selection (one of `EditorTab`).
 * - `drawerSearch` — current insert-drawer search query (transient).
 * - `drawerCollapsed` — collapsed flag for the sidebar panel.
 * - `outlineExpanded` — expansion map for the outline tree.
 * - `canvasViewport` — selected viewport id (matches a `Viewport.label`).
 * - `canvasZoom` — canvas zoom level (1 = 100%).
 * - `canvasRootHeight` — measured canvas root height in pixels.
 *
 * Sidebar-modules slices (PRD §9.2):
 * - `componentViewMode` — `"grid"` / `"list"` toggle for `insert`.
 * - `insertSectionsExpanded` — id-keyed map of which `insert` sections are open.
 * - `assetCategoryFilter` — current filter in `image`.
 * - `copyCategoryFilter` — current filter in `text`.
 * - `pagesExpanded` — id-keyed map for nested page groups in `layer/pages`.
 * - `layerSplitRatio` — split ratio of the `layer` module's pages/layers split.
 *
 * ### `EditorTab` migration
 *
 * The legacy union was `"insert" | "outline"`. v2 widens to
 * `"insert" | "layer" | "image" | "text"` (PRD §9.1). Persisted state
 * carrying `"outline"` is rewritten to `"layer"` on hydration via the
 * `migrate` callback below — host apps with stored UI state see the
 * sidebar land on the equivalent module after the bump.
 */

import { persist } from "zustand/middleware";
import { createStore, type StoreApi } from "zustand/vanilla";

export type EditorTab =
	| "insert"
	| "layer"
	| "image"
	| "text"
	| "copilot"
	| "history"
	| "design-system";

export type ComponentViewMode = "grid" | "list";

export type AssetCategoryFilter = "all" | "images" | "videos" | "audio";

export type CopyCategoryFilter = "all" | "basic" | "brand";

export interface EditorUiState {
	readonly activeTab: EditorTab;
	readonly drawerSearch: string;
	readonly drawerCollapsed: boolean;
	readonly outlineExpanded: Readonly<Record<string, boolean>>;
	readonly canvasViewport: string;
	readonly canvasZoom: number;
	readonly canvasRootHeight: number;
	readonly componentViewMode: ComponentViewMode;
	readonly insertSectionsExpanded: Readonly<Record<string, boolean>>;
	readonly assetCategoryFilter: AssetCategoryFilter;
	readonly copyCategoryFilter: CopyCategoryFilter;
	readonly pagesExpanded: Readonly<Record<string, boolean>>;
	readonly layerSplitRatio: number;
	setActiveTab(tab: EditorTab): void;
	setDrawerSearch(query: string): void;
	setDrawerCollapsed(collapsed: boolean): void;
	setOutlineExpanded(id: string, expanded: boolean): void;
	setCanvasViewport(viewport: string): void;
	setCanvasZoom(zoom: number): void;
	setCanvasRootHeight(height: number): void;
	setComponentViewMode(mode: ComponentViewMode): void;
	setInsertSectionExpanded(id: string, expanded: boolean): void;
	setAssetCategoryFilter(filter: AssetCategoryFilter): void;
	setCopyCategoryFilter(filter: CopyCategoryFilter): void;
	setPageExpanded(id: string, expanded: boolean): void;
	setLayerSplitRatio(ratio: number): void;
	reset(): void;
}

const INITIAL_STATE = {
	activeTab: "insert" as EditorTab,
	drawerSearch: "",
	drawerCollapsed: false,
	outlineExpanded: {} as Readonly<Record<string, boolean>>,
	canvasViewport: "desktop",
	canvasZoom: 1,
	canvasRootHeight: 0,
	componentViewMode: "grid" as ComponentViewMode,
	insertSectionsExpanded: {} as Readonly<Record<string, boolean>>,
	assetCategoryFilter: "all" as AssetCategoryFilter,
	copyCategoryFilter: "all" as CopyCategoryFilter,
	pagesExpanded: {} as Readonly<Record<string, boolean>>,
	layerSplitRatio: 0.4,
} as const;

/**
 * Persisted slice — declared explicitly so a field rename fails to
 * compile here instead of silently dropping the persisted value.
 * `drawerSearch` and `canvasRootHeight` are dropped on purpose
 * (transient input + measured layout). Sidebar-module preferences are
 * persisted per the policy in PRD §9.3.
 */
interface EditorUiPersistedSlice {
	readonly activeTab: EditorTab;
	readonly drawerCollapsed: boolean;
	readonly outlineExpanded: Readonly<Record<string, boolean>>;
	readonly canvasViewport: string;
	readonly canvasZoom: number;
	readonly componentViewMode: ComponentViewMode;
	readonly insertSectionsExpanded: Readonly<Record<string, boolean>>;
	readonly assetCategoryFilter: AssetCategoryFilter;
	readonly copyCategoryFilter: CopyCategoryFilter;
	readonly pagesExpanded: Readonly<Record<string, boolean>>;
	readonly layerSplitRatio: number;
}

/**
 * Persist schema version — bumped to 4 when the `design-system` tab
 * joined the {@link EditorTab} union (review finding AR-a); was 3 for
 * `history`. The migrate callback already coerces unknown `activeTab`
 * values to the default via {@link VALID_ACTIVE_TABS}, so the bump just
 * invalidates caches written by builds in between.
 */
export const EDITOR_UI_STORE_PERSIST_VERSION = 4;

const VALID_ACTIVE_TABS: ReadonlySet<EditorTab> = new Set([
	"insert",
	"layer",
	"image",
	"text",
	"copilot",
	"history",
	"design-system",
]);

const VALID_VIEW_MODES: ReadonlySet<ComponentViewMode> = new Set([
	"grid",
	"list",
]);

const VALID_ASSET_FILTERS: ReadonlySet<AssetCategoryFilter> = new Set([
	"all",
	"images",
	"videos",
	"audio",
]);

const VALID_COPY_FILTERS: ReadonlySet<CopyCategoryFilter> = new Set([
	"all",
	"basic",
	"brand",
]);

/**
 * Migration callback for `persist`. Rewrites legacy `activeTab`
 * values and merges defaults for any missing slice — both forward-
 * compat (older payload, newer code) and backward-compat (the user
 * may have an unknown serialized value in storage).
 *
 * Returning `unknown` matches `persist`'s API; the merge step
 * downstream coerces back into `EditorUiPersistedSlice`.
 */
function migratePersistedState(persisted: unknown, _version: number): unknown {
	if (persisted === null || typeof persisted !== "object") {
		return INITIAL_STATE;
	}
	const source = persisted as Record<string, unknown>;
	const activeTabRaw = source.activeTab;
	const activeTab: EditorTab =
		activeTabRaw === "outline"
			? "layer"
			: typeof activeTabRaw === "string" &&
					VALID_ACTIVE_TABS.has(activeTabRaw as EditorTab)
				? (activeTabRaw as EditorTab)
				: INITIAL_STATE.activeTab;

	const componentViewMode: ComponentViewMode =
		typeof source.componentViewMode === "string" &&
		VALID_VIEW_MODES.has(source.componentViewMode as ComponentViewMode)
			? (source.componentViewMode as ComponentViewMode)
			: INITIAL_STATE.componentViewMode;

	const assetCategoryFilter: AssetCategoryFilter =
		typeof source.assetCategoryFilter === "string" &&
		VALID_ASSET_FILTERS.has(source.assetCategoryFilter as AssetCategoryFilter)
			? (source.assetCategoryFilter as AssetCategoryFilter)
			: INITIAL_STATE.assetCategoryFilter;

	const copyCategoryFilter: CopyCategoryFilter =
		typeof source.copyCategoryFilter === "string" &&
		VALID_COPY_FILTERS.has(source.copyCategoryFilter as CopyCategoryFilter)
			? (source.copyCategoryFilter as CopyCategoryFilter)
			: INITIAL_STATE.copyCategoryFilter;

	const layerSplitRatio =
		typeof source.layerSplitRatio === "number" &&
		Number.isFinite(source.layerSplitRatio)
			? clampSplitRatio(source.layerSplitRatio)
			: INITIAL_STATE.layerSplitRatio;

	return {
		activeTab,
		drawerCollapsed:
			typeof source.drawerCollapsed === "boolean"
				? source.drawerCollapsed
				: INITIAL_STATE.drawerCollapsed,
		outlineExpanded: isStringBoolMap(source.outlineExpanded)
			? source.outlineExpanded
			: INITIAL_STATE.outlineExpanded,
		canvasViewport:
			typeof source.canvasViewport === "string"
				? source.canvasViewport
				: INITIAL_STATE.canvasViewport,
		canvasZoom:
			typeof source.canvasZoom === "number" &&
			Number.isFinite(source.canvasZoom)
				? source.canvasZoom
				: INITIAL_STATE.canvasZoom,
		componentViewMode,
		insertSectionsExpanded: isStringBoolMap(source.insertSectionsExpanded)
			? source.insertSectionsExpanded
			: INITIAL_STATE.insertSectionsExpanded,
		assetCategoryFilter,
		copyCategoryFilter,
		pagesExpanded: isStringBoolMap(source.pagesExpanded)
			? source.pagesExpanded
			: INITIAL_STATE.pagesExpanded,
		layerSplitRatio,
	} satisfies EditorUiPersistedSlice;
}

function isStringBoolMap(value: unknown): value is Record<string, boolean> {
	if (value === null || typeof value !== "object") return false;
	for (const v of Object.values(value)) {
		if (typeof v !== "boolean") return false;
	}
	return true;
}

function clampSplitRatio(ratio: number): number {
	if (ratio < 0.15) return 0.15;
	if (ratio > 0.85) return 0.85;
	return ratio;
}

/**
 * Upper bound on a persisted expansion map (review finding Z-e).
 * Toggling expansion accumulates one key per node id ever touched and
 * never reclaims keys for deleted nodes, so the persisted blob grew
 * without bound across a long session. Capping to the most-recently-
 * inserted N keys (object key order is insertion order) bounds the blob
 * without needing the live tree at the persistence boundary.
 */
const EXPANSION_MAP_PERSIST_LIMIT = 1000;

function capExpansionMap(
	map: Readonly<Record<string, boolean>>,
): Readonly<Record<string, boolean>> {
	const keys = Object.keys(map);
	if (keys.length <= EXPANSION_MAP_PERSIST_LIMIT) return map;
	const out: Record<string, boolean> = {};
	for (const key of keys.slice(-EXPANSION_MAP_PERSIST_LIMIT)) {
		out[key] = map[key] as boolean;
	}
	return out;
}

export interface CreateEditorUiStoreOptions {
	readonly storeId: string;
}

export type EditorUiStoreApi = StoreApi<EditorUiState>;

/**
 * Build a fresh per-instance store. Each call returns a brand-new
 * `StoreApi` — the persistence key is namespaced by `storeId` so two
 * concurrent stores can coexist without `localStorage` collisions.
 */
export function createEditorUiStore(
	options: CreateEditorUiStoreOptions,
): EditorUiStoreApi {
	const { storeId } = options;
	return createStore<EditorUiState>()(
		persist(
			(set) => ({
				...INITIAL_STATE,
				setActiveTab(activeTab) {
					set({ activeTab });
				},
				setDrawerSearch(drawerSearch) {
					set({ drawerSearch });
				},
				setDrawerCollapsed(drawerCollapsed) {
					set({ drawerCollapsed });
				},
				setOutlineExpanded(id, expanded) {
					set((state) => ({
						outlineExpanded: { ...state.outlineExpanded, [id]: expanded },
					}));
				},
				setCanvasViewport(canvasViewport) {
					set({ canvasViewport });
				},
				setCanvasZoom(canvasZoom) {
					set({ canvasZoom });
				},
				setCanvasRootHeight(canvasRootHeight) {
					set({ canvasRootHeight });
				},
				setComponentViewMode(componentViewMode) {
					set({ componentViewMode });
				},
				setInsertSectionExpanded(id, expanded) {
					set((state) => ({
						insertSectionsExpanded: {
							...state.insertSectionsExpanded,
							[id]: expanded,
						},
					}));
				},
				setAssetCategoryFilter(assetCategoryFilter) {
					set({ assetCategoryFilter });
				},
				setCopyCategoryFilter(copyCategoryFilter) {
					set({ copyCategoryFilter });
				},
				setPageExpanded(id, expanded) {
					set((state) => ({
						pagesExpanded: { ...state.pagesExpanded, [id]: expanded },
					}));
				},
				setLayerSplitRatio(layerSplitRatio) {
					set({ layerSplitRatio: clampSplitRatio(layerSplitRatio) });
				},
				reset() {
					set({ ...INITIAL_STATE });
				},
			}),
			{
				name: `anvilkit-ui-${storeId}`,
				version: EDITOR_UI_STORE_PERSIST_VERSION,
				partialize: (state): EditorUiPersistedSlice => ({
					activeTab: state.activeTab,
					drawerCollapsed: state.drawerCollapsed,
					// Z-e: cap the expansion maps so the persisted blob cannot
					// grow without bound as nodes are toggled then deleted.
					outlineExpanded: capExpansionMap(state.outlineExpanded),
					canvasViewport: state.canvasViewport,
					canvasZoom: state.canvasZoom,
					componentViewMode: state.componentViewMode,
					insertSectionsExpanded: capExpansionMap(state.insertSectionsExpanded),
					assetCategoryFilter: state.assetCategoryFilter,
					copyCategoryFilter: state.copyCategoryFilter,
					pagesExpanded: capExpansionMap(state.pagesExpanded),
					layerSplitRatio: state.layerSplitRatio,
				}),
				migrate: migratePersistedState,
				skipHydration: true,
			},
		),
	);
}
