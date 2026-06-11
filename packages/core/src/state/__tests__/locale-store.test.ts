/**
 * @file Tests for the locale store (i18n P1-T2).
 *
 * Coverage targets:
 * - Initial state: `locale === "en"` (matches `StudioConfigSchema.i18n.locale`).
 * - `setLocale` updates the field; `reset()` returns to "en".
 * - `persist` writes only `locale` under `anvilkit-core-locale-${storeId}`.
 * - The persist key is namespaced by `storeId` (per-instance isolation).
 * - A corrupt same-version blob is clamped to "en" (the `merge` sanitizer).
 * - `skipHydration` — nothing is read from storage until `rehydrate()`.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
	createLocaleStore,
	type LocaleStoreApi,
} from "@/state/slices/locale-store";

type PersistableStore = { persist: { rehydrate(): Promise<void> } };
function persistOf(store: LocaleStoreApi): PersistableStore {
	return store as unknown as PersistableStore;
}

const STORE_ID = "test";
const STORAGE_KEY = `anvilkit-core-locale-${STORE_ID}`;
let store: LocaleStoreApi;

beforeEach(() => {
	localStorage.clear();
	store = createLocaleStore({ storeId: STORE_ID });
});

describe("locale store — initial state", () => {
	it("starts with locale === 'en' to match StudioConfigSchema", () => {
		expect(store.getState().locale).toBe("en");
	});
});

describe("locale store — setters", () => {
	it("setLocale updates the active locale", () => {
		store.getState().setLocale("zh");
		expect(store.getState().locale).toBe("zh");
	});

	it("reset() returns to 'en' and leaves the actions intact", () => {
		store.getState().setLocale("zh");
		store.getState().reset();
		expect(store.getState().locale).toBe("en");
		store.getState().setLocale("ja");
		expect(store.getState().locale).toBe("ja");
	});
});

describe("locale store — persist / isolation", () => {
	it("writes only `locale` to localStorage", () => {
		store.getState().setLocale("zh");
		const raw = localStorage.getItem(STORAGE_KEY);
		expect(raw).not.toBeNull();
		const parsed = JSON.parse(raw as string) as {
			state: Record<string, unknown>;
		};
		expect(Object.keys(parsed.state)).toEqual(["locale"]);
		expect(parsed.state.locale).toBe("zh");
	});

	it("namespaces the persist key by storeId (no cross-instance collision)", () => {
		const a = createLocaleStore({ storeId: "a" });
		const b = createLocaleStore({ storeId: "b" });
		a.getState().setLocale("zh");
		b.getState().setLocale("ja");
		expect(localStorage.getItem("anvilkit-core-locale-a")).toContain("zh");
		expect(localStorage.getItem("anvilkit-core-locale-b")).toContain("ja");
	});

	it("skipHydration: nothing is written until a setter runs", () => {
		// A freshly-created store has not touched storage yet.
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});
});

describe("locale store — sanitizes a corrupt blob at the CURRENT version", () => {
	function liveVersion(): number {
		store.getState().setLocale("zh");
		const version = (
			JSON.parse(localStorage.getItem(STORAGE_KEY) as string) as {
				version: number;
			}
		).version;
		localStorage.clear();
		return version;
	}

	it("clamps a non-string locale to 'en'", async () => {
		const version = liveVersion();
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ state: { locale: 42 }, version }),
		);
		const corrupt = createLocaleStore({ storeId: STORE_ID });
		await persistOf(corrupt).persist.rehydrate();
		expect(corrupt.getState().locale).toBe("en");
	});

	it("rehydrates a valid persisted locale", async () => {
		const version = liveVersion();
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ state: { locale: "zh" }, version }),
		);
		await persistOf(store).persist.rehydrate();
		expect(store.getState().locale).toBe("zh");
	});
});

describe("locale store — requestLocale (uncontrolled)", () => {
	it("applies the switch (persisting it) and notifies the listener", () => {
		const seen: string[] = [];
		const listenerRef = { current: (locale: string) => seen.push(locale) };
		const notified = createLocaleStore({
			storeId: STORE_ID,
			onLocaleRequestRef: listenerRef,
		});
		notified.getState().requestLocale("zh");
		expect(notified.getState().locale).toBe("zh");
		expect(seen).toEqual(["zh"]);
		expect(
			(
				JSON.parse(localStorage.getItem(STORAGE_KEY) as string) as {
					state: { locale: string };
				}
			).state.locale,
		).toBe("zh");
	});

	it("no-ops (no write, no notify) when the locale already matches", () => {
		const seen: string[] = [];
		const listenerRef = { current: (locale: string) => seen.push(locale) };
		const notified = createLocaleStore({
			storeId: STORE_ID,
			onLocaleRequestRef: listenerRef,
		});
		notified.getState().requestLocale("en");
		expect(seen).toEqual([]);
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("reads the listener cell at call time (host can swap per render)", () => {
		const first: string[] = [];
		const second: string[] = [];
		const listenerRef: {
			current: ((locale: string) => void) | undefined;
		} = { current: (locale) => first.push(locale) };
		const notified = createLocaleStore({
			storeId: STORE_ID,
			onLocaleRequestRef: listenerRef,
		});
		notified.getState().requestLocale("zh");
		listenerRef.current = (locale) => second.push(locale);
		notified.getState().requestLocale("ja");
		expect(first).toEqual(["zh"]);
		expect(second).toEqual(["ja"]);
	});
});

describe("locale store — controlled mode", () => {
	it("seeds initialLocale synchronously and reset() returns to it", () => {
		const controlled = createLocaleStore({
			storeId: STORE_ID,
			controlled: true,
			initialLocale: "zh",
		});
		expect(controlled.getState().locale).toBe("zh");
		controlled.getState().setLocale("ja");
		controlled.getState().reset();
		expect(controlled.getState().locale).toBe("zh");
	});

	it("requestLocale notifies WITHOUT writing (controlled-input semantics)", () => {
		const seen: string[] = [];
		const controlled = createLocaleStore({
			storeId: STORE_ID,
			controlled: true,
			initialLocale: "zh",
			onLocaleRequestRef: { current: (locale) => seen.push(locale) },
		});
		controlled.getState().requestLocale("ja");
		expect(controlled.getState().locale).toBe("zh");
		expect(seen).toEqual(["ja"]);
	});

	it("never touches localStorage: no reads, no writes, blob preserved", async () => {
		// Pre-existing uncontrolled blob for the SAME storeId.
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ state: { locale: "ja" }, version: 1 }),
		);
		const controlled = createLocaleStore({
			storeId: STORE_ID,
			controlled: true,
			initialLocale: "zh",
		});
		await persistOf(controlled).persist.rehydrate();
		// Rehydrate is a no-op against the no-op backend — the persisted "ja"
		// is ignored, not loaded…
		expect(controlled.getState().locale).toBe("zh");
		// …and setters write nothing, leaving the blob intact for a later
		// uncontrolled mount.
		controlled.getState().setLocale("ko");
		expect(
			(
				JSON.parse(localStorage.getItem(STORAGE_KEY) as string) as {
					state: { locale: string };
				}
			).state.locale,
		).toBe("ja");
	});

	it("rehydrate does not clamp a pre-hydration setLocale back to the seed", async () => {
		// The write-through effect can run before the provider's rehydrate;
		// the merge sanitizer must fall back to the LIVE locale, not "en".
		const controlled = createLocaleStore({
			storeId: STORE_ID,
			controlled: true,
			initialLocale: "zh",
		});
		controlled.getState().setLocale("ja");
		await persistOf(controlled).persist.rehydrate();
		expect(controlled.getState().locale).toBe("ja");
	});
});
