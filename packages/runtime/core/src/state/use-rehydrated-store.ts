"use client";

/**
 * @file `useRehydratedStore` — shared per-`<Studio>` store lifecycle:
 * lazy create (keyed by `storeId`), explicit deferred rehydration, and
 * a `hydrated` flag so a provider can gate its subtree and avoid the
 * `INITIAL_STATE → persisted` flip flash.
 *
 * Replaces the identical create + fire-and-forget `rehydrate()` snippet
 * that was duplicated across the four store providers (the review
 * flagged the duplication). This is one helper, not a broad refactor —
 * each provider keeps its own context/selector hooks.
 *
 * ### Why a `hydrated` gate
 *
 * Stores are created with zustand `persist({ skipHydration: true })`
 * for SSR safety. Previously the providers rendered `children`
 * immediately, so any child reading the store during the first paint
 * saw `INITIAL_STATE`; the mount effect then rehydrated and a second
 * render flipped to the persisted slice — a visible dark-mode / sidebar
 * / active-tab flash. Gating the subtree behind `hydrated` removes the
 * flip: children render exactly once, with the persisted slice.
 *
 * ### SSR contract
 *
 * `skipHydration: true` ⇒ `persist.hasHydrated()` is `false` on the
 * server **and** on the first client paint (effects have not run yet),
 * so both render the same gated output. There is no server/client
 * divergence — `localStorage` is only ever touched inside the effect.
 * The brief client-only blank between mount and rehydrate is a
 * sub-frame synchronous `localStorage` read and is masked by the
 * `<Studio>` compile gate (which already renders nothing while plugins
 * compile).
 *
 * ### The gate must always open (review 0036 H-1)
 *
 * `onFinishHydration` is a **success-only** signal. zustand's `persist`
 * sets `hasHydrated` and notifies those listeners at the end of its
 * happy path; its trailing `.catch` records the error and returns
 * without doing either. It also returns early, still unhydrated, when
 * the storage engine is missing entirely — `createJSONStorage` swallows
 * a throwing `localStorage` getter and yields `undefined`.
 *
 * Waiting only on `onFinishHydration` therefore made three ordinary
 * browser conditions unrecoverable: blocked storage (Safari private
 * browsing, a sandboxed or third-party-blocked iframe, enterprise
 * policy), a persisted blob that no longer parses after a schema
 * change, and a host-supplied async `PersistStorage` that never
 * settles. `EditorStoreProvider` ANDs five of these flags, so any one
 * of them left `<Studio>` rendering a blank frame forever — no throw,
 * so no error boundary; no timeout, so no recovery; no log, so nothing
 * to diagnose.
 *
 * The gate is now bounded on every path. It opens when hydration
 * succeeds, when `rehydrate()` settles without having hydrated, or
 * after {@link HYDRATION_TIMEOUT_MS} — whichever comes first. Failure
 * opens it with the store's defaults and warns.
 *
 * The trade-off is deliberate: a slow-but-working async storage that
 * exceeds the timeout gets the `INITIAL_STATE → persisted` flip this
 * gate exists to prevent. That flip is cosmetic and rare; a permanently
 * blank editor is neither. Persisted UI preferences are not worth
 * blocking first paint on.
 *
 * ### `storeId` re-targeting
 *
 * An `injected` store (created by `<Studio>` so it can drive the store
 * imperatively) owns its own immutable persistence name, so a changed
 * `storeId` prop is advisory and the injected instance wins. A
 * provider-owned (non-injected) store is recreated when `storeId`
 * changes so live re-targeting actually re-keys persistence — fixing
 * the prior `storeId`-not-in-deps desync.
 */

import { useEffect, useRef, useState } from "react";

interface PersistableStore {
	readonly persist: {
		hasHydrated(): boolean;
		rehydrate(): void | Promise<void>;
		onFinishHydration(cb: () => void): () => void;
	};
}

function persistApi(store: unknown): PersistableStore["persist"] {
	return (store as PersistableStore).persist;
}

/**
 * Upper bound on how long the hydration gate may hold the subtree.
 *
 * Only reached when `rehydrate()` neither hydrates nor settles — i.e. a
 * custom async `PersistStorage` that hangs. A local `localStorage` read
 * completes within a frame, so this is a "something is definitely
 * broken" threshold, not a budget: crossing it means the gate opens
 * with defaults rather than never opening at all.
 */
export const HYDRATION_TIMEOUT_MS = 5000;

/**
 * Own one store instance per mount and report when its persisted slice
 * has been rehydrated.
 *
 * @param storeId stable persistence key segment for this `<Studio>`.
 * @param create store factory (`createThemeStore`, …).
 * @param injected externally-owned store; always wins (its persistence
 *   name is immutable, so `storeId` changes do not re-key it).
 * @returns the live store plus a `hydrated` flag the provider gates on.
 */
export function useRehydratedStore<TStore>(
	storeId: string,
	create: (opts: { storeId: string }) => TStore,
	injected?: TStore,
): { store: TStore; hydrated: boolean } {
	// Own one store for the current factory/key/injection tuple.
	//
	// This was a `useMemo`, which React documents as a performance
	// optimization with NO semantic guarantee: React is free to discard a
	// memo cache and recompute. For a derived value that is harmless; for
	// a *persisted store* it would mint a second instance mid-session,
	// orphaning every subscriber and resetting the slice under them
	// (review 0036 L-1). A ref-held cache is the escape hatch that does
	// promise identity — and it keeps the synchronous re-keying `useMemo`
	// gave us, which `useState(factory)` alone would not: an injected
	// store wins, and a provider-owned one is rebuilt the moment
	// `storeId` changes.
	//
	// The ref write during render is idempotent and the returned value
	// depends only on the arguments, so a StrictMode double-render or a
	// discarded pass produces the same store.
	const held = useRef<{
		readonly storeId: string;
		readonly create: (opts: { storeId: string }) => TStore;
		readonly injected: TStore | undefined;
		readonly store: TStore;
	} | null>(null);
	if (
		held.current === null ||
		held.current.storeId !== storeId ||
		held.current.create !== create ||
		held.current.injected !== injected
	) {
		held.current = {
			storeId,
			create,
			injected,
			store: injected ?? create({ storeId }),
		};
	}
	const store = held.current.store;

	// Track *which* store the hydrated flag is for, so a `storeId`
	// re-key (new store identity) reads as not-hydrated for this render
	// until the effect re-confirms — no re-key flash.
	const [hydratedStore, setHydratedStore] = useState<TStore | null>(() =>
		persistApi(store).hasHydrated() ? store : null,
	);

	useEffect(() => {
		const persist = persistApi(store);
		if (persist.hasHydrated()) {
			setHydratedStore(store);
			return;
		}

		// One idempotent exit for all four paths (success, failed,
		// timed out, torn down). `settled` doubles as the teardown guard
		// the previous `cancelled` flag provided: an *async*
		// `PersistStorage` whose `rehydrate()` resolves after this effect
		// tears down (unmount or a `storeId` re-key) finds `settled`
		// already true, so there is no `setState`-after-unmount and no
		// stale flag. `unsub` still removes the listener; this is the
		// belt to its braces.
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const settle = (outcome: "hydrated" | "unhydrated" | "hung"): void => {
			if (settled) {
				return;
			}
			settled = true;
			if (timer !== undefined) {
				clearTimeout(timer);
			}
			if (outcome === "unhydrated") {
				console.warn(
					"[anvilkit] persisted editor state could not be read (storage blocked, unavailable, or unparseable); continuing with defaults. Preferences will not persist this session.",
				);
			} else if (outcome === "hung") {
				console.warn(
					`[anvilkit] persisted editor state did not load within ${HYDRATION_TIMEOUT_MS}ms; continuing with defaults. A custom persist storage that never settles will do this.`,
				);
			}
			setHydratedStore(store);
		};

		const unsub = persist.onFinishHydration(() => settle("hydrated"));
		timer = setTimeout(() => settle("hung"), HYDRATION_TIMEOUT_MS);

		// Deferred (skipHydration) rehydrate. Synchronous localStorage
		// read; effects never run on the server so this is client-only.
		//
		// `rehydrate()` settles on BOTH paths — zustand ends its chain
		// with a `.catch`, so the returned thenable resolves even when
		// storage threw — but it sets `hasHydrated` only on success, and
		// returns a bare `undefined` when there is no storage engine at
		// all. Re-checking `hasHydrated()` once it settles is what turns
		// those two failures into "hydrated with defaults" instead of a
		// gate that never opens. `Promise.resolve` normalizes the custom
		// (non-Promise) thenable zustand returns for synchronous storage.
		void Promise.resolve(persist.rehydrate()).then(() => {
			settle(persist.hasHydrated() ? "hydrated" : "unhydrated");
		});

		return () => {
			settled = true;
			if (timer !== undefined) {
				clearTimeout(timer);
			}
			unsub();
		};
	}, [store]);

	return { store, hydrated: hydratedStore === store };
}
