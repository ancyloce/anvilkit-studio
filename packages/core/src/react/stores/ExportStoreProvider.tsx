/**
 * @file Per-`<Studio>` provider + selector hook for the export store.
 * See `ThemeStoreProvider` for the shared pattern rationale.
 */

import { createContext, type ReactNode, useContext } from "react";
import { useStore } from "zustand";

import {
	createExportStore,
	type ExportState,
	type ExportStoreApi,
} from "./export-store";
import { useRehydratedStore } from "./use-rehydrated-store";

const ExportStoreContext = createContext<ExportStoreApi | null>(null);

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
	const { store, hydrated } = useRehydratedStore(
		storeId,
		createExportStore,
		injected,
	);
	// Gate until rehydrated — see `useRehydratedStore` (SSR-safe).
	return (
		<ExportStoreContext.Provider value={store}>
			{hydrated ? children : null}
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
