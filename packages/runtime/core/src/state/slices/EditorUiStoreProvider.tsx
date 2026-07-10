/**
 * @file React context provider for the per-instance editor UI store.
 *
 * The provider owns one `EditorUiStoreApi` per `<Studio>` mount,
 * keyed by `storeId`, via the shared {@link useRehydratedStore} hook
 * (lazy create, `storeId` re-targeting, deferred rehydration). The
 * subtree is gated on `hydrated` so children never paint with
 * `INITIAL_STATE` and then flip to the persisted slice — SSR never
 * reads `localStorage`; see `useRehydratedStore` for the contract.
 */

import { type Context, createContext, type ReactNode, use } from "react";

import { useRehydratedStore } from "@/state/use-rehydrated-store";
import { createEditorUiStore, type EditorUiStoreApi } from "./editor-ui-store";

/**
 * Per-instance editor-UI-store context. Exported so the consolidated
 * `EditorStoreProvider` can supply it behind a single hydration gate;
 * `EditorUiStoreProvider` below still provides the same context standalone.
 */
export const EditorUiStoreContext: Context<EditorUiStoreApi | null> =
	createContext<EditorUiStoreApi | null>(null);

export interface EditorUiStoreProviderProps {
	readonly storeId: string;
	readonly children: ReactNode;
}

export function EditorUiStoreProvider({
	storeId,
	children,
}: EditorUiStoreProviderProps): ReactNode {
	const { store, hydrated } = useRehydratedStore(storeId, createEditorUiStore);
	// Gate the subtree until the persisted UI slice is rehydrated so
	// the sidebar / active tab / canvas viewport never paint with
	// INITIAL_STATE then flip. See `useRehydratedStore` (SSR-safe).
	return (
		<EditorUiStoreContext value={store}>
			{hydrated ? children : null}
		</EditorUiStoreContext>
	);
}

/**
 * Internal accessor for the active store. Throws if used outside an
 * `EditorUiStoreProvider` so missing wiring fails loudly during
 * development.
 */
export function useEditorUiStoreApi(): EditorUiStoreApi {
	const store = use(EditorUiStoreContext);
	if (store === null) {
		throw new Error(
			"useEditorUiStore was called outside of <EditorUiStoreProvider>. " +
				"Ensure the calling component is rendered inside <Studio>.",
		);
	}
	return store;
}
