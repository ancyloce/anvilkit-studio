/**
 * @file Per-`<Studio>` provider + selector hooks for the locale store.
 *
 * Mirrors `ThemeStoreProvider`: one `LocaleStoreApi` per editor instance
 * (or injected by `<Studio>` so it can drive the store imperatively),
 * owned + rehydrated via the shared {@link useRehydratedStore} hook, with
 * the subtree gated on `hydrated`. The {@link LocaleStoreContext} is also
 * supplied by `EditorStoreProvider` behind its single hydration gate; this
 * standalone provider remains for tests and legacy mounts.
 *
 * {@link useOptionalLocale} is the **null-tolerant** read used by
 * `EditorI18nProvider`, which must stay usable with no locale store above
 * it (RSC, tests, the legacy `chrome="puck"` path) — it returns `"en"`
 * instead of throwing, mirroring `useMsg`'s no-provider fallback.
 */

import { type Context, createContext, type ReactNode, use } from "react";
import { useStore } from "zustand";
import type { Locale } from "@/i18n/registry";
import { useRehydratedStore } from "../use-rehydrated-store";
import {
	createLocaleStore,
	type LocaleState,
	type LocaleStoreApi,
} from "./locale-store";

/**
 * Per-instance locale-store context. Exported so the consolidated
 * `EditorStoreProvider` can supply it behind a single hydration gate; the
 * standalone `LocaleStoreProvider` below still provides the same context
 * for tests and legacy mounts.
 */
export const LocaleStoreContext: Context<LocaleStoreApi | null> =
	createContext<LocaleStoreApi | null>(null);

/**
 * A read-only fallback store backing {@link useOptionalLocale} when no
 * provider is present. Never mutated (no `setLocale`), so it stays at the
 * `"en"` default forever — `useStore` is therefore always called on a
 * non-null store, keeping the hook call unconditional and React-safe.
 */
const FALLBACK_LOCALE_STORE = createLocaleStore({
	storeId: "__i18n_fallback__",
});

export interface LocaleStoreProviderProps {
	readonly storeId: string;
	/**
	 * Optional externally-owned store. `<Studio>` creates the instance
	 * itself (so it can seed/read it imperatively) and passes it in;
	 * standalone callers omit it and the provider owns one.
	 */
	readonly store?: LocaleStoreApi;
	readonly children: ReactNode;
}

export function LocaleStoreProvider({
	storeId,
	store: injected,
	children,
}: LocaleStoreProviderProps): ReactNode {
	const { store, hydrated } = useRehydratedStore(
		storeId,
		createLocaleStore,
		injected,
	);
	// Gate the subtree until the persisted locale is rehydrated so children
	// never paint with the default then flip (see `useRehydratedStore`).
	return (
		<LocaleStoreContext value={store}>
			{hydrated ? children : null}
		</LocaleStoreContext>
	);
}

/**
 * The active per-instance locale store. Throws outside a
 * `LocaleStoreProvider` so missing wiring fails loudly. Use
 * {@link useOptionalLocale} where absence is legitimate.
 */
export function useLocaleStoreApi(): LocaleStoreApi {
	const store = use(LocaleStoreContext);
	if (store === null) {
		throw new Error(
			"useLocaleStore was called outside of <LocaleStoreProvider>. " +
				"Ensure the calling component is rendered inside <Studio>.",
		);
	}
	return store;
}

/**
 * Reactive locale-store selector. Same call shape as the theme hook:
 * `useLocaleStore((s) => s.locale)`.
 */
export function useLocaleStore<TResult>(
	selector: (state: LocaleState) => TResult,
): TResult {
	return useStore(useLocaleStoreApi(), selector);
}

/**
 * Null-tolerant active locale. Returns the store's `locale` when a
 * `LocaleStoreContext` is present, else `"en"` — so `EditorI18nProvider`
 * (and any standalone / RSC consumer) resolves against English without a
 * locale store, mirroring `useMsg`'s no-provider fallback. `useStore` is
 * always called on a non-null store (the context value or the read-only
 * fallback), so the hook call stays unconditional.
 */
export function useOptionalLocale(): Locale {
	const store = use(LocaleStoreContext) ?? FALLBACK_LOCALE_STORE;
	return useStore(store, (state) => state.locale);
}
