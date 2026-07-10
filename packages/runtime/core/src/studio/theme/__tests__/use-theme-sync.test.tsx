/**
 * @file Tests for `useThemeSync()` — verifies the round trip:
 * `mode` change → theme store `resolved` update → `.dark` class on
 * `document.documentElement` (PRD §3.4). Post-H3 the theme store is
 * per-instance, so the hook runs inside a `ThemeStoreProvider` with a
 * test-owned store instance.
 */

import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	createThemeStore,
	type ThemeStoreApi,
	ThemeStoreProvider,
} from "@/state/index";
import { useThemeSync } from "@/theme/use-theme-sync";

let store: ThemeStoreApi;

function wrapper({ children }: { children: ReactNode }) {
	return (
		<ThemeStoreProvider storeId="test" store={store}>
			{children}
		</ThemeStoreProvider>
	);
}

beforeEach(() => {
	document.documentElement.classList.remove("dark");
	store = createThemeStore({ storeId: "test" });
	// jsdom does not implement matchMedia by default — provide a stub
	// that always reports "light" so tests can deterministically swap
	// the store mode and observe the effect.
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		configurable: true,
		value: (query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
			addListener: () => undefined,
			removeListener: () => undefined,
			onchange: null,
			dispatchEvent: () => false,
		}),
	});
});

afterEach(() => {
	cleanup();
	document.documentElement.classList.remove("dark");
});

describe("useThemeSync", () => {
	it("resolves system preference and writes resolved + .dark class", () => {
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			configurable: true,
			value: (query: string) => ({
				matches: query.includes("dark"),
				media: query,
				addEventListener: () => undefined,
				removeEventListener: () => undefined,
				addListener: () => undefined,
				removeListener: () => undefined,
				onchange: null,
				dispatchEvent: () => false,
			}),
		});

		renderHook(() => useThemeSync(), { wrapper });
		expect(store.getState().resolved).toBe("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});

	it("writes resolved=light and removes .dark when mode='light'", () => {
		document.documentElement.classList.add("dark");
		const hook = renderHook(() => useThemeSync(), { wrapper });
		act(() => {
			store.getState().setMode("light");
		});
		hook.rerender();
		expect(store.getState().resolved).toBe("light");
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("flips to dark when mode='dark' regardless of system preference", () => {
		const hook = renderHook(() => useThemeSync(), { wrapper });
		act(() => {
			store.getState().setMode("dark");
		});
		hook.rerender();
		expect(store.getState().resolved).toBe("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});

	it("restores the host's prior .dark state when the last instance unmounts", () => {
		// Host starts light (beforeEach removed `.dark`).
		const hook = renderHook(() => useThemeSync(), { wrapper });
		act(() => {
			store.getState().setMode("dark");
		});
		hook.rerender();
		expect(document.documentElement.classList.contains("dark")).toBe(true);

		hook.unmount();
		// Stranding the host dark on unmount is exactly the bug (P2-1) —
		// the class must revert to the pre-mount (light) state.
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("leaves a host that was already dark before mount dark after unmount", () => {
		document.documentElement.classList.add("dark");
		const hook = renderHook(() => useThemeSync(), { wrapper });
		act(() => {
			store.getState().setMode("light");
		});
		hook.rerender();
		expect(document.documentElement.classList.contains("dark")).toBe(false);

		hook.unmount();
		// The snapshot taken at first mount was dark, so teardown restores it.
		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});

	it("ref-counts so one instance unmounting does not strand the others", () => {
		store.getState().setMode("dark");
		const a = renderHook(() => useThemeSync(), { wrapper });
		const b = renderHook(() => useThemeSync(), { wrapper });
		expect(document.documentElement.classList.contains("dark")).toBe(true);

		a.unmount();
		// `b` still owns the class — it must remain applied.
		expect(document.documentElement.classList.contains("dark")).toBe(true);

		b.unmount();
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});
});
