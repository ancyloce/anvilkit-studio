/**
 * @file `<EditorStoreProvider>` — single-gate provider for the four
 * per-`<Studio>` editor stores (provider-consolidation Phase 2).
 *
 * Replaces the four nested store providers (theme / export / ai /
 * editor-ui) — each of which gated its own subtree on its own rehydration —
 * with ONE provider that hydrates all four and supplies their **existing**
 * contexts behind a SINGLE gate (report finding P3/F4: 4 serial hydration
 * boundaries → 1). The four context objects and every selector hook
 * (`useThemeStore`, `useExportStore`, `useAiStore`, `useEditorUiStore`, …)
 * are unchanged; this provider just supplies them together.
 *
 * The bundle is created by the `<Studio>` controller and injected (`store`)
 * so it can drive the stores imperatively (apply default theme, reset on
 * teardown); standalone callers (tests / legacy mounts) pass only `storeId`
 * and each slice is created on demand. The standalone per-slice providers
 * (`ThemeStoreProvider`, …) remain for callers that mount a single store.
 */

import type { ReactNode } from "react";
import { EditorUiStoreContext } from "@/state/slices/EditorUiStoreProvider";
import { createEditorUiStore } from "@/state/slices/editor-ui-store";
import { AiStoreContext } from "./slices/AiStoreProvider";
import { createAiStore } from "./slices/ai-store";
import { ExportStoreContext } from "./slices/ExportStoreProvider";
import type { EditorStoreBundle } from "./editor-store-bundle";
import { createExportStore } from "./slices/export-store";
import { ThemeStoreContext } from "./slices/ThemeStoreProvider";
import { createThemeStore } from "./slices/theme-store";
import { useRehydratedStore } from "./use-rehydrated-store";

export interface EditorStoreProviderProps {
	readonly storeId: string;
	/**
	 * Optional externally-owned bundle. `<Studio>` creates it so it can
	 * drive the stores imperatively; standalone callers omit it and each
	 * slice is created on demand (keyed by `storeId`).
	 */
	readonly store?: EditorStoreBundle;
	readonly children: ReactNode;
}

/**
 * Supply the four editor-store contexts behind a single hydration gate.
 */
export function EditorStoreProvider({
	storeId,
	store: injected,
	children,
}: EditorStoreProviderProps): ReactNode {
	const theme = useRehydratedStore(storeId, createThemeStore, injected?.theme);
	const exportSlice = useRehydratedStore(
		storeId,
		createExportStore,
		injected?.export,
	);
	const ai = useRehydratedStore(storeId, createAiStore, injected?.ai);
	const ui = useRehydratedStore(storeId, createEditorUiStore, injected?.ui);

	// One combined gate: render `children` only once every slice's persisted
	// state has rehydrated, so the chrome paints exactly once (no
	// INITIAL_STATE → persisted flip). This replaces the four serial gates
	// the per-slice providers each imposed.
	const hydrated =
		theme.hydrated && exportSlice.hydrated && ai.hydrated && ui.hydrated;

	// Context nesting order matches the pre-Phase-2 stack
	// (EditorUi → Theme → Export → Ai) so the effective provider graph is
	// unchanged. The four contexts are independent, so this order is purely
	// cosmetic — no consumer depends on their relative nesting.
	return (
		<EditorUiStoreContext value={ui.store}>
			<ThemeStoreContext value={theme.store}>
				<ExportStoreContext value={exportSlice.store}>
					<AiStoreContext value={ai.store}>
						{hydrated ? children : null}
					</AiStoreContext>
				</ExportStoreContext>
			</ThemeStoreContext>
		</EditorUiStoreContext>
	);
}
