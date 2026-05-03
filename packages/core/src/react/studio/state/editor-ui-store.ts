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
 * ### State slice (PRD §7.4)
 *
 * - `activeTab` — sidebar tab selection (`"insert" | "outline"`).
 * - `drawerSearch` — current insert-drawer search query (transient).
 * - `drawerCollapsed` — collapsed flag for the insert drawer.
 * - `outlineExpanded` — expansion map for the outline tree.
 * - `canvasViewport` — selected viewport id (matches a `Viewport.label`).
 * - `canvasZoom` — canvas zoom level (1 = 100%).
 * - `canvasRootHeight` — measured canvas root height in pixels.
 */

import { persist } from "zustand/middleware";
import { createStore, type StoreApi } from "zustand/vanilla";

export type EditorTab = "insert" | "outline";

export interface EditorUiState {
	readonly activeTab: EditorTab;
	readonly drawerSearch: string;
	readonly drawerCollapsed: boolean;
	readonly outlineExpanded: Readonly<Record<string, boolean>>;
	readonly canvasViewport: string;
	readonly canvasZoom: number;
	readonly canvasRootHeight: number;
	setActiveTab(tab: EditorTab): void;
	setDrawerSearch(query: string): void;
	setDrawerCollapsed(collapsed: boolean): void;
	setOutlineExpanded(id: string, expanded: boolean): void;
	setCanvasViewport(viewport: string): void;
	setCanvasZoom(zoom: number): void;
	setCanvasRootHeight(height: number): void;
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
} as const;

/**
 * Persisted slice — declared explicitly so a field rename fails to
 * compile here instead of silently dropping the persisted value.
 * `drawerSearch` and `canvasRootHeight` are dropped on purpose.
 */
interface EditorUiPersistedSlice {
	readonly activeTab: EditorTab;
	readonly drawerCollapsed: boolean;
	readonly outlineExpanded: Readonly<Record<string, boolean>>;
	readonly canvasViewport: string;
	readonly canvasZoom: number;
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
				reset() {
					set({ ...INITIAL_STATE });
				},
			}),
			{
				name: `anvilkit-ui-${storeId}`,
				partialize: (state): EditorUiPersistedSlice => ({
					activeTab: state.activeTab,
					drawerCollapsed: state.drawerCollapsed,
					outlineExpanded: state.outlineExpanded,
					canvasViewport: state.canvasViewport,
					canvasZoom: state.canvasZoom,
				}),
				skipHydration: true,
			},
		),
	);
}
