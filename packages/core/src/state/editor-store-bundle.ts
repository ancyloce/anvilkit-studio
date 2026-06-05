/**
 * @file `createEditorStore` — the coordinated per-`<Studio>` editor store
 * bundle (provider-consolidation Phase 2, "coordinated bundle" strategy).
 *
 * Phase 2 collapses the four hydration-gated editor providers
 * (theme / export / ai / editor-ui) into one `EditorStoreProvider` with a
 * single hydration gate. Rather than merge the four zustand stores into one
 * (which would change the persisted-key layout and force a migration), the
 * stores are kept **exactly as-is** — same reducers, same `persist`
 * middleware, same four `anvilkit-*` keys — and simply created together as
 * a bundle. `EditorStoreProvider` then supplies the four existing contexts
 * behind one gate, so every `useThemeStore` / `useExportStore` /
 * `useAiStore` / `useEditorUiStore` hook keeps its exact call shape and the
 * persisted data of existing users is untouched (zero migration).
 *
 * @see {@link file://./EditorStoreProvider.tsx}
 */

import {
	createEditorUiStore,
	type EditorUiStoreApi,
} from "@/state/slices/editor-ui-store";
import { type AiStoreApi, createAiStore } from "./slices/ai-store";
import { createExportStore, type ExportStoreApi } from "./slices/export-store";
import { createThemeStore, type ThemeStoreApi } from "./slices/theme-store";

/** Options for {@link createEditorStore}. Mirrors the per-slice factories. */
export interface CreateEditorStoreOptions {
	readonly storeId: string;
}

/**
 * The four per-instance editor stores, bundled. Each member is the
 * unchanged vanilla store from its existing factory, with its own `persist`
 * key (`anvilkit-core-theme-${id}`, `anvilkit-core-export-${id}`,
 * `anvilkit-core-ai-${id}`, `anvilkit-ui-${id}`).
 */
export interface EditorStoreBundle {
	readonly theme: ThemeStoreApi;
	readonly export: ExportStoreApi;
	readonly ai: AiStoreApi;
	readonly ui: EditorUiStoreApi;
}

/**
 * Create the four editor stores for one `<Studio>` instance. Pure
 * composition of the existing factories — no behavior change to any slice,
 * no persisted-key change.
 */
export function createEditorStore({
	storeId,
}: CreateEditorStoreOptions): EditorStoreBundle {
	return {
		theme: createThemeStore({ storeId }),
		export: createExportStore({ storeId }),
		ai: createAiStore({ storeId }),
		ui: createEditorUiStore({ storeId }),
	};
}
