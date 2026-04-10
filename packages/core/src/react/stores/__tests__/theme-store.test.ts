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

import { useThemeStore } from "../theme-store.js";

const STORAGE_KEY = "anvilkit-core-theme";

beforeEach(() => {
	localStorage.clear();
	useThemeStore.setState(useThemeStore.getInitialState(), true);
});

describe("useThemeStore — initial state", () => {
	it("starts with mode === 'system' to match StudioConfigSchema", () => {
		expect(useThemeStore.getState().mode).toBe("system");
	});

	it("starts with resolved === 'light' as a pre-mount fallback", () => {
		expect(useThemeStore.getState().resolved).toBe("light");
	});
});

describe("useThemeStore — setters", () => {
	it("setMode updates the preference", () => {
		useThemeStore.getState().setMode("dark");
		expect(useThemeStore.getState().mode).toBe("dark");
	});

	it("setMode accepts 'light', 'dark', and 'system'", () => {
		useThemeStore.getState().setMode("dark");
		expect(useThemeStore.getState().mode).toBe("dark");
		useThemeStore.getState().setMode("light");
		expect(useThemeStore.getState().mode).toBe("light");
		useThemeStore.getState().setMode("system");
		expect(useThemeStore.getState().mode).toBe("system");
	});

	it("setResolved updates the on-screen value", () => {
		useThemeStore.getState().setResolved("dark");
		expect(useThemeStore.getState().resolved).toBe("dark");
	});

	it("mode and resolved are independent fields", () => {
		// Preference is "system" but OS resolves to dark — the two
		// must track independently so the toggle button can show
		// "System" while the page paints dark.
		useThemeStore.getState().setMode("system");
		useThemeStore.getState().setResolved("dark");
		expect(useThemeStore.getState().mode).toBe("system");
		expect(useThemeStore.getState().resolved).toBe("dark");
	});
});

describe("useThemeStore — reset()", () => {
	it("returns every field to initial state", () => {
		const store = useThemeStore.getState();
		store.setMode("dark");
		store.setResolved("dark");

		useThemeStore.getState().reset();

		const after = useThemeStore.getState();
		expect(after.mode).toBe("system");
		expect(after.resolved).toBe("light");
	});

	it("leaves the action functions intact", () => {
		useThemeStore.getState().setMode("dark");
		useThemeStore.getState().reset();
		useThemeStore.getState().setMode("light");
		expect(useThemeStore.getState().mode).toBe("light");
	});
});

describe("useThemeStore — persist / partialize", () => {
	it("writes only `mode` to localStorage", () => {
		const store = useThemeStore.getState();
		store.setMode("dark");
		store.setResolved("dark");

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
		useThemeStore.getState().setMode("dark");
		expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
	});

	it("rehydrating from a partial blob restores mode without touching resolved", async () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ state: { mode: "dark" }, version: 0 }),
		);

		await useThemeStore.persist.rehydrate();

		const state = useThemeStore.getState();
		expect(state.mode).toBe("dark");
		// `resolved` is not in the persisted blob, so it stays at the
		// pre-mount fallback. `<Studio>` updates it via matchMedia
		// once the React tree mounts.
		expect(state.resolved).toBe("light");
	});
});
