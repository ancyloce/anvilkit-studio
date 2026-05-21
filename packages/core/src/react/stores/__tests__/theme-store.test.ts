/**
 * @file Tests for `useThemeStore` (task `core-013`).
 *
 * Coverage targets:
 *
 * - Initial state: `mode === "system"` (matching
 *   `StudioConfigSchema.theme.defaultMode`), `resolved === "light"`
 *   as the pre-mount fallback.
 * - Setters update their respective fields independently.
 * - `reset()` returns to initial state.
 * - `persist`'s `partialize` writes **only** `mode` — never
 *   `resolved`.
 * - Rehydrating from a blob containing only `mode` leaves
 *   `resolved` at its initial value.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { createThemeStore, type ThemeStoreApi } from "@/stores/theme-store";

type PersistableStore = { persist: { rehydrate(): Promise<void> } };
function persistOf(store: ThemeStoreApi): PersistableStore {
	return store as unknown as PersistableStore;
}

const STORE_ID = "test";
const STORAGE_KEY = `anvilkit-core-theme-${STORE_ID}`;
let store: ThemeStoreApi;

beforeEach(() => {
	localStorage.clear();
	store = createThemeStore({ storeId: STORE_ID });
});

describe("useThemeStore — initial state", () => {
	it("starts with mode === 'system' to match StudioConfigSchema", () => {
		expect(store.getState().mode).toBe("system");
	});

	it("starts with resolved === 'light' as a pre-mount fallback", () => {
		expect(store.getState().resolved).toBe("light");
	});
});

describe("useThemeStore — setters", () => {
	it("setMode updates the preference", () => {
		store.getState().setMode("dark");
		expect(store.getState().mode).toBe("dark");
	});

	it("setMode accepts 'light', 'dark', and 'system'", () => {
		store.getState().setMode("dark");
		expect(store.getState().mode).toBe("dark");
		store.getState().setMode("light");
		expect(store.getState().mode).toBe("light");
		store.getState().setMode("system");
		expect(store.getState().mode).toBe("system");
	});

	it("setResolved updates the on-screen value", () => {
		store.getState().setResolved("dark");
		expect(store.getState().resolved).toBe("dark");
	});

	it("mode and resolved are independent fields", () => {
		// Preference is "system" but OS resolves to dark — the two
		// must track independently so the toggle button can show
		// "System" while the page paints dark.
		store.getState().setMode("system");
		store.getState().setResolved("dark");
		expect(store.getState().mode).toBe("system");
		expect(store.getState().resolved).toBe("dark");
	});
});

describe("useThemeStore — reset()", () => {
	it("returns every field to initial state", () => {
		const actions = store.getState();
		actions.setMode("dark");
		actions.setResolved("dark");

		store.getState().reset();

		const after = store.getState();
		expect(after.mode).toBe("system");
		expect(after.resolved).toBe("light");
	});

	it("leaves the action functions intact", () => {
		store.getState().setMode("dark");
		store.getState().reset();
		store.getState().setMode("light");
		expect(store.getState().mode).toBe("light");
	});
});

describe("useThemeStore — persist / partialize", () => {
	it("writes only `mode` to localStorage", () => {
		const actions = store.getState();
		actions.setMode("dark");
		actions.setResolved("dark");

		const raw = localStorage.getItem(STORAGE_KEY);
		expect(raw).not.toBeNull();
		const parsed = JSON.parse(raw as string) as {
			state: Record<string, unknown>;
			version: number;
		};
		expect(Object.keys(parsed.state)).toEqual(["mode"]);
		expect(parsed.state.mode).toBe("dark");
		expect(parsed.state).not.toHaveProperty("resolved");
	});

	it("uses the `anvilkit-core-theme` storage key", () => {
		store.getState().setMode("dark");
		expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
	});

	it("rehydrating from a partial blob restores mode without touching resolved", async () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ state: { mode: "dark" }, version: 0 }),
		);

		await persistOf(store).persist.rehydrate();

		const state = store.getState();
		expect(state.mode).toBe("dark");
		// `resolved` is not in the persisted blob, so it stays at the
		// pre-mount fallback. `<Studio>` updates it via matchMedia
		// once the React tree mounts.
		expect(state.resolved).toBe("light");
	});
});
