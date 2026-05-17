/**
 * @file Per-`<Studio>` provider + selector hook for the export store.
 * See `ThemeStoreProvider` for the shared pattern rationale.
 */

import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { useStore } from "zustand";

import {
	createExportStore,
	type ExportState,
	type ExportStoreApi,
} from "./export-store";

const ExportStoreContext = createContext<ExportStoreApi | null>(null);

interface PersistableStore {
	readonly persist: { rehydrate(): void | Promise<void> };
}

function withPersistApi(store: ExportStoreApi): PersistableStore {
	return store as unknown as PersistableStore;
}

export interface ExportStoreProviderProps {
	readonly storeId: string;
	readonly store?: ExportStoreApi;
	readonly children: ReactNode;
}

export function ExportStoreProvider({
	storeId,
	store: injected,
	children,
}: ExportStoreProviderProps): ReactNode {
	const [store] = useState(() => injected ?? createExportStore({ storeId }));
	useEffect(() => {
		void withPersistApi(store).persist.rehydrate();
	}, [store]);
	return (
		<ExportStoreContext.Provider value={store}>
			{children}
		</ExportStoreContext.Provider>
	);
}

export function useExportStoreApi(): ExportStoreApi {
	const store = useContext(ExportStoreContext);
	if (store === null) {
		throw new Error(
			"useExportStore was called outside of <ExportStoreProvider>. " +
				"Ensure the calling component is rendered inside <Studio>.",
		);
	}
	return store;
}

/**
 * Reactive export-store selector. Same call shape as the former
 * module-singleton hook: `useExportStore((s) => s.currentFormat)`.
 */
export function useExportStore<TResult>(
	selector: (state: ExportState) => TResult,
): TResult {
	return useStore(useExportStoreApi(), selector);
}
