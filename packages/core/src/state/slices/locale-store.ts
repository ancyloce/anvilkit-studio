/**
 * @file Zustand store for the active Studio editor locale (i18n P1).
 *
 * Holds a single field — {@link LocaleState.locale}, a BCP-47-ish tag
 * (default `"en"`). Switching it re-renders every `useMsg` consumer
 * **without** remounting `<Studio>`, which is the whole point of lifting
 * locale out of the immutable i18n context into a reactive store.
 *
 * ### Persistence
 *
 * `locale` persists under `anvilkit-core-locale-${storeId}` — per
 * `<Studio>` instance, exactly like the theme store, so two editors on one
 * page never collide on `localStorage`. `skipHydration: true` keeps SSR /
 * RSC and the first client render agreed on the seeded default; the
 * provider rehydrates from a mount-time effect.
 *
 * ### Default
 *
 * Initial `locale` is `"en"`, matching `StudioConfigSchema`'s `i18n.locale`
 * default (added in P3). `<Studio>` seeds the *config* locale onto the
 * store at mount, but only when nothing was persisted (P3 — kept in sync by
 * hand, like the theme default).
 */

import { devtools, persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { Locale } from "@/i18n/registry";
import { devtoolsEnabled } from "../devtools.js";

/** Full shape of the locale store — one read field, two setters. */
export interface LocaleState {
	/** The active locale tag. Persisted. */
	readonly locale: Locale;
	/** Switch the active locale — typically a header language toggle. */
	setLocale(locale: Locale): void;
	/**
	 * Restore the locale to its initial value. Present for parity with the
	 * other stores in this directory and as a uniform test isolation hook.
	 */
	reset(): void;
}

/**
 * Persisted slice shape — `locale` only. Declared explicitly so a field
 * rename fails to compile here instead of silently dropping the value.
 */
interface LocaleStorePartial {
	readonly locale: Locale;
}

/** Immutable initial state. `locale` defaults to `"en"` (the baseline). */
const INITIAL_STATE = {
	locale: "en" as Locale,
} as const;

/**
 * `persist` schema version. Bump when {@link LocaleStorePartial} changes.
 */
const LOCALE_STORE_PERSIST_VERSION = 1;

/**
 * Defensive `persist` sanitizer: a persisted `locale` must be a non-empty
 * string; anything else (corrupt blob, non-string) clamps to `"en"`. Wired
 * into **both** `migrate` (version-mismatch path) and `merge` (every
 * hydrate) so a corrupt same-version blob can never poison the live store —
 * mirrors the theme store's clamp.
 */
function migrateLocalePersistedState(persisted: unknown): LocaleStorePartial {
	const source =
		typeof persisted === "object" && persisted !== null
			? (persisted as { locale?: unknown })
			: {};
	const locale =
		typeof source.locale === "string" && source.locale.length > 0
			? source.locale
			: INITIAL_STATE.locale;
	return { locale };
}

export interface CreateLocaleStoreOptions {
	readonly storeId: string;
}

/**
 * The vanilla locale store handle. Inferred from {@link createLocaleStore}
 * so it carries the `persist` middleware surface (`hasHydrated`,
 * `onFinishHydration`, `rehydrate`, …) with full fidelity — consumers reach
 * `store.persist` directly instead of casting through `unknown`.
 */
export type LocaleStoreApi = ReturnType<typeof createLocaleStore>;

/**
 * Build a fresh per-`<Studio>` locale store. The persistence key is
 * namespaced by `storeId` so two editors on the same page never collide on
 * `localStorage` or bleed locale state into each other. Consume via
 * {@link LocaleStoreProvider} + the `useLocaleStore` selector hook.
 *
 * @example
 * const store = createLocaleStore({ storeId: "a" });
 * store.getState().setLocale("zh");
 */
export function createLocaleStore(options: CreateLocaleStoreOptions) {
	const { storeId } = options;
	return createStore<LocaleState>()(
		devtools(
			persist(
				(set) => ({
					...INITIAL_STATE,
					setLocale(locale) {
						set({ locale });
					},
					reset() {
						set({ ...INITIAL_STATE });
					},
				}),
				{
					name: `anvilkit-core-locale-${storeId}`,
					version: LOCALE_STORE_PERSIST_VERSION,
					migrate: migrateLocalePersistedState,
					// Sanitize on every hydrate, not just on a version bump:
					// `migrate` is skipped when the persisted version matches, so
					// `merge` is the only hook that clamps a corrupt same-version
					// blob before it reaches the live store.
					merge: (persisted, current): LocaleState => ({
						...current,
						...migrateLocalePersistedState(persisted),
					}),
					partialize: (state): LocaleStorePartial => ({
						locale: state.locale,
					}),
					// SSR safety: skip synchronous rehydration so the server and
					// first-client render agree on the seeded default. The
					// provider rehydrates from a mount-time effect.
					skipHydration: true,
				},
			),
			{
				name: `anvilkit-core-locale-${storeId}`,
				enabled: devtoolsEnabled(),
			},
		),
	);
}
