/**
 * @file Per-`<Studio>` provider + selector hook for the AI store.
 * See `ThemeStoreProvider` for the shared pattern rationale.
 */

import { type Context, createContext, type ReactNode, use } from "react";
import { useStore } from "zustand";

import { type AiState, type AiStoreApi, createAiStore } from "./ai-store";
import { useRehydratedStore } from "../use-rehydrated-store";

/**
 * Per-instance AI-store context. Exported so the consolidated
 * `EditorStoreProvider` can supply it behind a single hydration gate;
 * `AiStoreProvider` below still provides the same context standalone.
 */
export const AiStoreContext: Context<AiStoreApi | null> =
	createContext<AiStoreApi | null>(null);

export interface AiStoreProviderProps {
	readonly storeId: string;
	readonly store?: AiStoreApi;
	readonly children: ReactNode;
}

export function AiStoreProvider({
	storeId,
	store: injected,
	children,
}: AiStoreProviderProps): ReactNode {
	const { store, hydrated } = useRehydratedStore(
		storeId,
		createAiStore,
		injected,
	);
	// Gate until rehydrated — see `useRehydratedStore` (SSR-safe).
	return (
		<AiStoreContext value={store}>{hydrated ? children : null}</AiStoreContext>
	);
}

export function useAiStoreApi(): AiStoreApi {
	const store = use(AiStoreContext);
	if (store === null) {
		throw new Error(
			"useAiStore was called outside of <AiStoreProvider>. " +
				"Ensure the calling component is rendered inside <Studio>.",
		);
	}
	return store;
}

/**
 * Reactive AI-store selector. Same call shape as the former
 * module-singleton hook: `useAiStore((s) => s.isGenerating)`.
 */
export function useAiStore<TResult>(
	selector: (state: AiState) => TResult,
): TResult {
	return useStore(useAiStoreApi(), selector);
}
