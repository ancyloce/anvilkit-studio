/**
 * Read the Studio locale that core's UNCONTROLLED locale store persisted
 * for a given `storeId` (zustand-persist JSON under
 * `anvilkit-core-locale-${storeId}`). Used to seed the host-side locale
 * state that drives the locale-aware Puck config: `onLocaleChange` only
 * fires on *switches*, so without this read a returning zh/ja/ko visitor
 * would get localized chrome but English component field labels until
 * their next switch.
 *
 * Returns "en" on the server and on any parse failure; call from a
 * mount effect (not a `useState` initializer) so the SSR and first
 * client render agree and hydration stays clean.
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
