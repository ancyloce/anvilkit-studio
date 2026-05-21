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
	// Lazy create; recreate on `storeId` change for the non-injected
	// path. A ref (not `useState`) so the swap is deterministic in
	// render without an extra pass; idempotent for an unchanged key.
	const ref = useRef<{ store: TStore; storeId: string } | null>(null);
	if (ref.current === null) {
		ref.current = { store: injected ?? create({ storeId }), storeId };
	} else if (injected !== undefined && ref.current.store !== injected) {
		// Controller swapped the injected store (rare): adopt it.
		ref.current = { store: injected, storeId };
	} else if (injected === undefined && ref.current.storeId !== storeId) {
		ref.current = { store: create({ storeId }), storeId };
	}
	const store = ref.current.store;

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
		const unsub = persist.onFinishHydration(() => setHydratedStore(store));
		// Deferred (skipHydration) rehydrate. Synchronous localStorage
		// read; effects never run on the server so this is client-only.
		void persist.rehydrate();
		return unsub;
	}, [store]);

	return { store, hydrated: hydratedStore === store };
}
