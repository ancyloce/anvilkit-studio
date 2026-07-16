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
 *
 * `layer` module Pages/Layers tabs (task Phase 6 — replaces the v5
 * `layerSplitRatio` stacked-split field; DESIGN.md §6 "one panel, one
 * mode at a time" fits a tab switcher better than a resizable split):
 * - `layerPanelMode` — which of Pages/Layers is the active tab.
 *
 * Resizable/collapsible panel shell (task Phase 5):
 * - `leftPanelWidth` — persisted width (px) of the left nav/module panel.
 * - `inspectorWidth` — persisted width (px) of the right inspector panel.
 * - `inspectorCollapsed` — collapsed flag for the inspector (mirrors
 *   `drawerCollapsed`'s role for the left panel).
 * - `focusMode` — hides both side panels while keeping the rail + canvas
 *   toolbar. Transient (not persisted, like `drawerSearch`): a session-
 *   scoped viewing override, not a durable per-Studio preference — it
 *   never overwrites `drawerCollapsed`/`inspectorCollapsed`/the panel
 *   widths, it only changes what the layout shell renders while active.
 *
 * Inspector `object`-field sections (task Phase 7):
 * - `fieldSectionsExpanded` — id-keyed map of which `<InspectorSection>`
 *   (collapsible `object`-field groups in `FieldsPanel`) are open. Keyed
 *   by the field's Puck `id` (falling back to `name`), so two different
 *   components' same-named object field (e.g. both call theirs "seo")
 *   share a default expand state — an accepted, low-stakes tradeoff
 *   given Puck field overrides don't receive the owning component's id.
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
	| "design-system"
	| "seo";

export type ComponentViewMode = "grid" | "list";

export type AssetCategoryFilter = "all" | "images" | "videos" | "audio";

export type CopyCategoryFilter = "all" | "basic" | "brand";

export type LayerPanelMode = "pages" | "layers";

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
	readonly layerPanelMode: LayerPanelMode;
	readonly leftPanelWidth: number;
	readonly inspectorWidth: number;
	readonly inspectorCollapsed: boolean;
	readonly focusMode: boolean;
	readonly fieldSectionsExpanded: Readonly<Record<string, boolean>>;
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
	setFieldSectionExpanded(id: string, expanded: boolean): void;
	setLayerPanelMode(mode: LayerPanelMode): void;
	setLeftPanelWidth(width: number): void;
	setInspectorWidth(width: number): void;
	setInspectorCollapsed(collapsed: boolean): void;
	setFocusMode(focusMode: boolean): void;
	reset(): void;
}

/**
 * Left/inspector panel size bounds (task Phase 5). Exported so the
 * layout shell can pass the identical values to `<ResizablePanel
 * minSize/maxSize/defaultSize>` — one source of truth instead of
 * duplicating the numbers at each call site.
 */
export const LEFT_PANEL_DEFAULT_WIDTH = 288;
export const LEFT_PANEL_MIN_WIDTH = 240;
export const LEFT_PANEL_MAX_WIDTH = 400;
export const INSPECTOR_DEFAULT_WIDTH = 336;
export const INSPECTOR_MIN_WIDTH = 288;
export const INSPECTOR_MAX_WIDTH = 440;

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
	fieldSectionsExpanded: {} as Readonly<Record<string, boolean>>,
	layerPanelMode: "pages" as LayerPanelMode,
	leftPanelWidth: LEFT_PANEL_DEFAULT_WIDTH,
	inspectorWidth: INSPECTOR_DEFAULT_WIDTH,
	inspectorCollapsed: false,
	focusMode: false,
} as const;

/**
 * Persisted slice — declared explicitly so a field rename fails to
 * compile here instead of silently dropping the persisted value.
 * `drawerSearch`, `canvasRootHeight`, and `focusMode` are dropped on
 * purpose (transient input, measured layout, and session-scoped viewing
 * override, respectively). Sidebar-module preferences are persisted per
 * the policy in PRD §9.3.
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
	readonly fieldSectionsExpanded: Readonly<Record<string, boolean>>;
	readonly layerPanelMode: LayerPanelMode;
	readonly leftPanelWidth: number;
	readonly inspectorWidth: number;
	readonly inspectorCollapsed: boolean;
}

/**
 * Persist schema version — bumped to 8 when `fieldSectionsExpanded`
 * (task Phase 7 — collapsible `InspectorSection` state for `object`
 * fields) was added. The migrate callback already defaults missing
 * fields via {@link migratePersistedState}, so the bump just
 * invalidates caches written by builds in between.
 */
export const EDITOR_UI_STORE_PERSIST_VERSION = 8;

const VALID_ACTIVE_TABS: ReadonlySet<EditorTab> = new Set([
	"insert",
	"layer",
	"image",
	"text",
	"copilot",
	"history",
	"design-system",
	"seo",
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

const VALID_LAYER_PANEL_MODES: ReadonlySet<LayerPanelMode> = new Set([
	"pages",
	"layers",
]);

/**
 * Sanitize a persisted blob into a valid {@link EditorUiPersistedSlice}.
 * Rewrites legacy `activeTab` values and clamps every field to its
 * documented domain (unknown tab → default, out-of-range split ratio →
 * clamped, non-bool-map → default) — both forward-compat (older payload,
 * newer code) and backward-compat (the user may have an unknown
 * serialized value in storage).
 *
 * Wired into **both** `migrate` (runs only on a version mismatch) and
 * `merge` (runs on every hydrate — review finding: zustand skips
 * `migrate` when the persisted `version` equals the store version, so a
 * corrupt same-version blob would otherwise merge verbatim). Routing the
 * clamp through `merge` is what makes the coercion hold at *every*
 * version, not just on a bump.
 *
 * Returning `unknown` matches `persist`'s `migrate` API; the merge step
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

	const layerPanelMode: LayerPanelMode =
		typeof source.layerPanelMode === "string" &&
		VALID_LAYER_PANEL_MODES.has(source.layerPanelMode as LayerPanelMode)
			? (source.layerPanelMode as LayerPanelMode)
			: INITIAL_STATE.layerPanelMode;

	const leftPanelWidth =
		typeof source.leftPanelWidth === "number" &&
		Number.isFinite(source.leftPanelWidth)
			? clampLeftPanelWidth(source.leftPanelWidth)
			: INITIAL_STATE.leftPanelWidth;

	const inspectorWidth =
		typeof source.inspectorWidth === "number" &&
		Number.isFinite(source.inspectorWidth)
			? clampInspectorWidth(source.inspectorWidth)
			: INITIAL_STATE.inspectorWidth;

	return {
		activeTab,
		drawerCollapsed:
			typeof source.drawerCollapsed === "boolean"
				? source.drawerCollapsed
				: INITIAL_STATE.drawerCollapsed,
		outlineExpanded: capExpansionMap(
			isStringBoolMap(source.outlineExpanded)
				? source.outlineExpanded
				: INITIAL_STATE.outlineExpanded,
		),
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
		insertSectionsExpanded: capExpansionMap(
			isStringBoolMap(source.insertSectionsExpanded)
				? source.insertSectionsExpanded
				: INITIAL_STATE.insertSectionsExpanded,
		),
		assetCategoryFilter,
		copyCategoryFilter,
		pagesExpanded: capExpansionMap(
			isStringBoolMap(source.pagesExpanded)
				? source.pagesExpanded
				: INITIAL_STATE.pagesExpanded,
		),
		fieldSectionsExpanded: capExpansionMap(
			isStringBoolMap(source.fieldSectionsExpanded)
				? source.fieldSectionsExpanded
				: INITIAL_STATE.fieldSectionsExpanded,
		),
		layerPanelMode,
		leftPanelWidth,
		inspectorWidth,
		inspectorCollapsed:
			typeof source.inspectorCollapsed === "boolean"
				? source.inspectorCollapsed
				: INITIAL_STATE.inspectorCollapsed,
	} satisfies EditorUiPersistedSlice;
}

function isStringBoolMap(value: unknown): value is Record<string, boolean> {
	if (value === null || typeof value !== "object") return false;
	for (const v of Object.values(value)) {
		if (typeof v !== "boolean") return false;
	}
	return true;
}

function clampLeftPanelWidth(width: number): number {
	if (width < LEFT_PANEL_MIN_WIDTH) return LEFT_PANEL_MIN_WIDTH;
	if (width > LEFT_PANEL_MAX_WIDTH) return LEFT_PANEL_MAX_WIDTH;
	return width;
}

function clampInspectorWidth(width: number): number {
	if (width < INSPECTOR_MIN_WIDTH) return INSPECTOR_MIN_WIDTH;
	if (width > INSPECTOR_MAX_WIDTH) return INSPECTOR_MAX_WIDTH;
	return width;
}

/**
 * Upper bound on an expansion map (review finding Z-e; report 0003 P2-10).
 * Toggling expansion accumulates one key per node id ever touched and never
 * reclaims keys for deleted nodes, so a map grew without bound across a long
 * session. The cap is applied both in the toggle reducers (bounding live
 * memory) and in `partialize` (bounding the persisted blob and sanitizing an
 * oversized hydrated blob), keeping the most-recently-inserted N keys (object
 * key order is insertion order) without needing the live tree.
 */
const EXPANSION_MAP_LIMIT = 1000;

function capExpansionMap(
	map: Readonly<Record<string, boolean>>,
): Readonly<Record<string, boolean>> {
	const keys = Object.keys(map);
	if (keys.length <= EXPANSION_MAP_LIMIT) return map;
	const out: Record<string, boolean> = {};
	for (const key of keys.slice(-EXPANSION_MAP_LIMIT)) {
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
						outlineExpanded: capExpansionMap({
							...state.outlineExpanded,
							[id]: expanded,
						}),
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
						insertSectionsExpanded: capExpansionMap({
							...state.insertSectionsExpanded,
							[id]: expanded,
						}),
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
						pagesExpanded: capExpansionMap({
							...state.pagesExpanded,
							[id]: expanded,
						}),
					}));
				},
				setFieldSectionExpanded(id, expanded) {
					set((state) => ({
						fieldSectionsExpanded: capExpansionMap({
							...state.fieldSectionsExpanded,
							[id]: expanded,
						}),
					}));
				},
				setLayerPanelMode(layerPanelMode) {
					set({ layerPanelMode });
				},
				setLeftPanelWidth(leftPanelWidth) {
					set({ leftPanelWidth: clampLeftPanelWidth(leftPanelWidth) });
				},
				setInspectorWidth(inspectorWidth) {
					set({ inspectorWidth: clampInspectorWidth(inspectorWidth) });
				},
				setInspectorCollapsed(inspectorCollapsed) {
					set({ inspectorCollapsed });
				},
				setFocusMode(focusMode) {
					set({ focusMode });
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
					fieldSectionsExpanded: capExpansionMap(state.fieldSectionsExpanded),
					layerPanelMode: state.layerPanelMode,
					leftPanelWidth: state.leftPanelWidth,
					inspectorWidth: state.inspectorWidth,
					inspectorCollapsed: state.inspectorCollapsed,
				}),
				migrate: migratePersistedState,
				// `migrate` only fires on a version mismatch; `merge` runs
				// on every hydrate. Sanitizing here too clamps a corrupt
				// blob persisted at the CURRENT version (external/hand-edited
				// storage, or a future partialize-shape change that forgets
				// to bump the version) instead of merging it verbatim over
				// the live defaults.
				merge: (persisted, current): EditorUiState => ({
					...current,
					...(migratePersistedState(
						persisted,
						EDITOR_UI_STORE_PERSIST_VERSION,
					) as EditorUiPersistedSlice),
				}),
				skipHydration: true,
			},
		),
	);
}
