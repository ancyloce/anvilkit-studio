"use client";

/**
 * @file Per-Studio recently-applied design tokens.
 *
 * Recents are ephemeral UI convenience state: they survive picker churn inside
 * one Studio mount, but neither persist across reloads nor leak between two
 * editors rendered in the same browser realm.
 */

import {
	createContext,
	createElement,
	type ReactNode,
	useContext,
	useState,
	useSyncExternalStore,
} from "react";

/** How many recently-applied tokens a picker offers. */
export const RECENT_TOKEN_LIMIT = 5;

interface TokenRecentsStore {
	readonly subscribe: (listener: () => void) => () => void;
	readonly getSnapshot: () => readonly string[];
	readonly remember: (tokenId: string) => void;
}

function createTokenRecentsStore(): TokenRecentsStore {
	let recentTokenIds: readonly string[] = [];
	const listeners = new Set<() => void>();
	return {
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getSnapshot: () => recentTokenIds,
		remember(tokenId) {
			recentTokenIds = [
				tokenId,
				...recentTokenIds.filter((id) => id !== tokenId),
			].slice(0, RECENT_TOKEN_LIMIT);
			for (const listener of listeners) listener();
		},
	};
}

const TokenRecentsContext = createContext<TokenRecentsStore | null>(null);

/** Own one ephemeral recents store for one Studio editor mount. */
export function TokenRecentsProvider({
	children,
}: {
	readonly children: ReactNode;
}): ReactNode {
	const [store] = useState(createTokenRecentsStore);
	return createElement(
		TokenRecentsContext.Provider,
		{ value: store },
		children,
	);
}

function useTokenRecentsStore(): TokenRecentsStore {
	const store = useContext(TokenRecentsContext);
	if (store === null) {
		throw new Error("token recents require a TokenRecentsProvider");
	}
	return store;
}

/** Stable callback that records a token in the current Studio mount. */
export function useRememberToken(): (tokenId: string) => void {
	return useTokenRecentsStore().remember;
}

/** This Studio mount's recents, newest first. */
export function useTokenRecents(): readonly string[] {
	const store = useTokenRecentsStore();
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
	);
}
