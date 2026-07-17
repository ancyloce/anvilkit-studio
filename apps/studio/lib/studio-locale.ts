/**
 * Read the Studio locale that core's UNCONTROLLED locale store persisted
 * for a given `storeId` (zustand-persist JSON under
 * `anvilkit-core-locale-${storeId}`). Used to seed the host-side locale
 * state that drives the locale-aware Puck config: `onLocaleChange` only
 * fires on *switches*, so without this read a returning zh/ja/ko visitor
 * would get localized chrome but English component field labels until
 * their next switch.
 *
 * Returns "en" on the server and on any parse failure. Client components
 * consume this through `useSyncExternalStore`, with "en" as the server
 * snapshot, so hydration stays clean without a post-paint locale flash.
 */
export function readPersistedStudioLocale(storeId: string): string {
	if (typeof window === "undefined") {
		return "en";
	}
	try {
		const raw = window.localStorage.getItem(`anvilkit-core-locale-${storeId}`);
		if (!raw) {
			return "en";
		}
		const parsed = JSON.parse(raw) as { state?: { locale?: unknown } };
		return typeof parsed.state?.locale === "string"
			? parsed.state.locale
			: "en";
	} catch {
		return "en";
	}
}

const studioLocaleListeners = new Set<() => void>();

/** Subscribe to same-tab locale changes and cross-tab persistence updates. */
export function subscribeToPersistedStudioLocale(
	listener: () => void,
): () => void {
	studioLocaleListeners.add(listener);
	const handleStorage = (event: StorageEvent) => {
		if (event.key?.startsWith("anvilkit-core-locale-")) {
			listener();
		}
	};
	window.addEventListener("storage", handleStorage);
	return () => {
		studioLocaleListeners.delete(listener);
		window.removeEventListener("storage", handleStorage);
	};
}

/** Notify subscribers after Studio persists an uncontrolled locale switch. */
export function notifyPersistedStudioLocaleChanged(): void {
	for (const listener of studioLocaleListeners) {
		listener();
	}
}
