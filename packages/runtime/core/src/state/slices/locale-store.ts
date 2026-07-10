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
 * default (added in P3). In **uncontrolled** mode `<Studio>` seeds the
 * *config* locale onto the store at mount, but only when nothing was
 * persisted (P3 — kept in sync by hand, like the theme default).
 *
 * ### Controlled mode (config-centric i18n refactor)
 *
 * When the host explicitly sets `config.i18n.locale`, `<Studio>` creates
 * the store with `controlled: true` + `initialLocale`: persistence is
 * bypassed via a no-op storage backend (same `persist` type surface,
 * instant hydration, zero `localStorage` traffic), and
 * {@link LocaleState.requestLocale} notifies the host instead of writing —
 * the host applies switches by re-rendering with a new config value, which
 * `<Studio>`'s write-through effect feeds back here via `setLocale`.
 */

import {
	createJSONStorage,
	devtools,
	persist,
	type StateStorage,
} from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { Locale } from "@/i18n/registry";
import { devtoolsEnabled } from "../devtools.js";

/** Full shape of the locale store — one read field, three setters. */
export interface LocaleState {
	/** The active locale tag. Persisted (uncontrolled mode only). */
	readonly locale: Locale;
	/**
	 * Switch the active locale — the direct write. Always applies, never
	 * notifies. In controlled mode this is the write-through channel
	 * (`config.i18n.locale` → store) and the imperative escape hatch.
	 */
	setLocale(locale: Locale): void;
	/**
	 * Locale-switch *request* — the UI entry point (the built-in
	 * `LanguageSwitcher`). No-ops when `locale` already matches. Otherwise:
	 * - **Uncontrolled:** applies via `setLocale` (persisting it), then
	 *   notifies the bound `onLocaleRequest` listener.
	 * - **Controlled** (`config.i18n.locale` host-set): notifies **only** —
	 *   the host applies the switch by re-rendering with the new config
	 *   value, exactly like a controlled `<input>`.
	 */
	requestLocale(locale: Locale): void;
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
 * string; anything else (corrupt blob, non-string) clamps to `fallback` —
 * the store's own initial locale, NOT the module `"en"` constant: zustand
 * calls `merge(undefined, current)` even when storage yields nothing (the
 * controlled-mode no-op backend always does), and clamping to `"en"` there
 * would wipe a controlled store's seeded `initialLocale` on rehydrate.
 * Wired into **both** `migrate` (version-mismatch path) and `merge` (every
 * hydrate) so a corrupt same-version blob can never poison the live store —
 * mirrors the theme store's clamp.
 */
function migrateLocalePersistedState(
	persisted: unknown,
	fallback: Locale,
): LocaleStorePartial {
	const source =
		typeof persisted === "object" && persisted !== null
			? (persisted as { locale?: unknown })
			: {};
	const locale =
		typeof source.locale === "string" && source.locale.length > 0
			? source.locale
			: fallback;
	return { locale };
}

/**
 * Mutable listener cell for {@link LocaleState.requestLocale}
 * notifications. A plain `{ current }` ref (structurally compatible with
 * React's `useRef` result) so the store stays React-free and the host can
 * swap the callback per render without re-creating the store.
 */
export interface LocaleRequestListenerRef {
	current: ((locale: Locale) => void) | undefined;
}

/**
 * A no-op `StateStorage` backing controlled-mode stores: nothing is read
 * from or written to `localStorage`, hydration completes instantly against
 * the seeded `initialLocale`, and a pre-existing persisted blob for the
 * same `storeId` is left untouched (a later uncontrolled mount recovers
 * it). Keeping the `persist` middleware mounted (instead of conditionally
 * omitting it) preserves the `LocaleStoreApi` type — `persist.hasHydrated`
 * / `onFinishHydration` and the shared hydration gate work unchanged.
 */
const NOOP_STATE_STORAGE: StateStorage = {
	getItem: () => null,
	setItem: () => {
		// Intentional no-op: controlled mode never persists.
	},
	removeItem: () => {
		// Intentional no-op: controlled mode never persists.
	},
};

export interface CreateLocaleStoreOptions {
	readonly storeId: string;
	/**
	 * Controlled mode: the host explicitly set `config.i18n.locale`, which
	 * is now the authoritative source. Persistence is bypassed (no-op
	 * storage) and {@link LocaleState.requestLocale} notifies without
	 * writing. Latched at store creation. Defaults to `false`.
	 */
	readonly controlled?: boolean;
	/**
	 * Initial `locale` (controlled mode passes the config value so the
	 * first render — including SSR — already shows the controlled locale;
	 * no `en → zh` flash). Defaults to `"en"`.
	 */
	readonly initialLocale?: Locale;
	/**
	 * Listener cell invoked by {@link LocaleState.requestLocale} —
	 * `<Studio>` keeps it pointed at the latest `onLocaleChange` prop.
	 */
	readonly onLocaleRequestRef?: LocaleRequestListenerRef;
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
	const {
		storeId,
		controlled = false,
		initialLocale,
		onLocaleRequestRef,
	} = options;
	// Controlled mode seeds the config locale synchronously so the very
	// first render (and SSR markup) already resolves it — no flash.
	const initialState = {
		locale: initialLocale ?? INITIAL_STATE.locale,
	} as const;
	return createStore<LocaleState>()(
		devtools(
			persist(
				(set, get) => ({
					...initialState,
					setLocale(locale) {
						set({ locale });
					},
					requestLocale(locale) {
						if (locale === get().locale) {
							return;
						}
						if (!controlled) {
							set({ locale });
						}
						onLocaleRequestRef?.current?.(locale);
					},
					reset() {
						set({ ...initialState });
					},
				}),
				{
					name: `anvilkit-core-locale-${storeId}`,
					version: LOCALE_STORE_PERSIST_VERSION,
					migrate: (persisted) =>
						migrateLocalePersistedState(persisted, initialState.locale),
					// Controlled mode: a no-op storage backend — same persist
					// surface/type, zero localStorage traffic, instant
					// hydration against the seeded initial locale. The key is
					// conditionally *omitted* (not set to `undefined`) in
					// uncontrolled mode: zustand's `persist` spreads caller
					// options over its defaults, so an explicit `undefined`
					// would clobber the localStorage default and silently
					// disable persistence.
					...(controlled
						? {
								storage: createJSONStorage<LocaleStorePartial>(
									() => NOOP_STATE_STORAGE,
								),
							}
						: {}),
					// Sanitize on every hydrate, not just on a version bump:
					// `migrate` is skipped when the persisted version matches, so
					// `merge` is the only hook that clamps a corrupt same-version
					// blob before it reaches the live store.
					merge: (persisted, current): LocaleState => ({
						...current,
						// Fall back to the LIVE locale (not the initial one): a
						// no-blob rehydrate must be a no-op even after `setLocale`
						// ran pre-hydration (e.g. the controlled write-through).
						...migrateLocalePersistedState(persisted, current.locale),
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
