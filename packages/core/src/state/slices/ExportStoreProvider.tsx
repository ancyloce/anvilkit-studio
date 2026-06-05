/**
 * @file Per-`<Studio>` provider + selector hook for the export store.
 * See `ThemeStoreProvider` for the shared pattern rationale.
 */

import { type Context, createContext, type ReactNode, use } from "react";
import { useStore } from "zustand";

import {
	createExportStore,
	type ExportState,
	type ExportStoreApi,
} from "./export-store";
import { useRehydratedStore } from "../use-rehydrated-store";

/**
 * Per-instance export-store context. Exported so the consolidated
 * `EditorStoreProvider` can supply it behind a single hydration gate;
 * `ExportStoreProvider` below still provides the same context standalone.
 */
export const ExportStoreContext: Context<ExportStoreApi | null> =
	createContext<ExportStoreApi | null>(null);

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
		<ExportStoreContext value={store}>
			{hydrated ? children : null}
		</ExportStoreContext>
	);
}

export function useExportStoreApi(): ExportStoreApi {
	const store = use(ExportStoreContext);
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
