/**
 * @file React context provider for the per-instance editor UI store.
 *
 * The provider owns one `EditorUiStoreApi` per `<Studio>` mount,
 * keyed by `storeId`. The store is created lazily inside `useState`
 * so React's strict-mode double-invocation does not produce two
 * stores during dev. A mount-time effect kicks `persist.rehydrate()`
 * — SSR never reads `localStorage`, the client picks up the
 * persisted slice on the next tick.
 */

import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

import { createEditorUiStore, type EditorUiStoreApi } from "./editor-ui-store";

const EditorUiStoreContext = createContext<EditorUiStoreApi | null>(null);

interface PersistableStore {
	readonly persist: {
		rehydrate(): void | Promise<void>;
	};
}

function withPersistApi(store: EditorUiStoreApi): PersistableStore {
	return store as unknown as PersistableStore;
}

export interface EditorUiStoreProviderProps {
	readonly storeId: string;
	readonly children: ReactNode;
}

export function EditorUiStoreProvider({
	storeId,
	children,
}: EditorUiStoreProviderProps): ReactNode {
	const [store] = useState(() => createEditorUiStore({ storeId }));
	useEffect(() => {
		// Stores created with `skipHydration: true` need an explicit
		// rehydrate call once the client environment is ready. This
		// effect runs only on the client, so `localStorage` is safe.
		void withPersistApi(store).persist.rehydrate();
	}, [store]);
	return (
		<EditorUiStoreContext.Provider value={store}>
			{children}
		</EditorUiStoreContext.Provider>
	);
}

/**
 * Internal accessor for the active store. Throws if used outside an
 * `EditorUiStoreProvider` so missing wiring fails loudly during
 * development.
 */
export function useEditorUiStoreApi(): EditorUiStoreApi {
	const store = useContext(EditorUiStoreContext);
	if (store === null) {
		throw new Error(
			"useEditorUiStore was called outside of <EditorUiStoreProvider>. " +
				"Ensure the calling component is rendered inside <Studio>.",
		);
	}
	return store;
}
