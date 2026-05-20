/**
 * @file Per-`<Studio>` provider + selector hook for the AI store.
 * See `ThemeStoreProvider` for the shared pattern rationale.
 */

import { createContext, type ReactNode, useContext } from "react";
import { useStore } from "zustand";

import { type AiState, type AiStoreApi, createAiStore } from "./ai-store";
import { useRehydratedStore } from "./use-rehydrated-store";

const AiStoreContext = createContext<AiStoreApi | null>(null);

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
    <AiStoreContext.Provider value={store}>
      {hydrated ? children : null}
    </AiStoreContext.Provider>
  );
}

export function useAiStoreApi(): AiStoreApi {
  const store = useContext(AiStoreContext);
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
