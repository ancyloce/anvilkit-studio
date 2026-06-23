/**
 * @file Per-`<Studio>` provider + selector hook for the theme store.
 *
 * Mirrors `EditorUiStoreProvider`: one `ThemeStoreApi` per editor
 * instance (or injected by `<Studio>` so it can also drive the store
 * imperatively), owned + rehydrated via the shared
 * {@link useRehydratedStore} hook, with the subtree gated on
 * `hydrated` to remove the first-paint theme flash.
 * `useThemeStore(selector)` preserves the original call shape so
 * existing call sites (e.g. `use-theme-sync`) are unchanged — they
 * just must now sit inside a `ThemeStoreProvider`, which `<Studio>`
 * guarantees.
 */

import { type Context, createContext, type ReactNode, use } from "react";
import { useStore } from "zustand";
import { useRehydratedStore } from "../use-rehydrated-store";
import {
	createThemeStore,
	type ThemeState,
	type ThemeStoreApi,
} from "./theme-store";

/**
 * Per-instance theme-store context. Exported so the consolidated
 * {@link file://./EditorStoreProvider.tsx | EditorStoreProvider} can
 * supply it behind a single hydration gate; the standalone
 * `ThemeStoreProvider` below still provides the same context for tests
 * and legacy mounts.
 */
export const ThemeStoreContext: Context<ThemeStoreApi | null> =
	createContext<ThemeStoreApi | null>(null);

/** Props for {@link ThemeStoreProvider}. */
export interface ThemeStoreProviderProps {
	/**
	 * Per-instance store id. Namespaces the theme store's persistence key
	 * so two concurrent `<Studio>` editors keep independent theme state.
	 */
	readonly storeId: string;
	/**
	 * Optional externally-owned store. `<Studio>` creates the instance
	 * itself (so it can call `.getState()` imperatively) and passes it
	 * in; standalone callers omit it and the provider owns one.
	 */
	readonly store?: ThemeStoreApi;
	/**
	 * Subtree that reads the theme store via `useThemeStore` /
	 * `useThemeStoreApi`.
	 */
	readonly children: ReactNode;
}

export function ThemeStoreProvider({
	storeId,
	store: injected,
	children,
}: ThemeStoreProviderProps): ReactNode {
	const { store, hydrated } = useRehydratedStore(
		storeId,
		createThemeStore,
		injected,
	);
	// Gate the subtree until the persisted slice is rehydrated so
	// children never paint with INITIAL_STATE then flip (see
	// `useRehydratedStore` for the SSR contract).
	return (
		<ThemeStoreContext value={store}>
			{hydrated ? children : null}
		</ThemeStoreContext>
	);
}

/**
 * The active per-instance theme store. Throws outside a
 * `ThemeStoreProvider` so missing wiring fails loudly.
 */
export function useThemeStoreApi(): ThemeStoreApi {
	const store = use(ThemeStoreContext);
	if (store === null) {
		throw new Error(
			"useThemeStore was called outside of <ThemeStoreProvider>. " +
				"Ensure the calling component is rendered inside <Studio>.",
		);
	}
	return store;
}

/**
 * Reactive theme-store selector. Same call shape as the former
 * module-singleton hook: `useThemeStore((s) => s.mode)`.
 */
export function useThemeStore<TResult>(
	selector: (state: ThemeState) => TResult,
): TResult {
	return useStore(useThemeStoreApi(), selector);
}
