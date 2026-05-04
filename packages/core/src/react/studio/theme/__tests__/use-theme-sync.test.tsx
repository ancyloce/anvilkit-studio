/**
 * @file Tests for `useThemeSync()` — verifies the round trip:
 * `mode` change → `useThemeStore.resolved` update → `.dark` class on
 * `document.documentElement` (PRD §3.4).
 */

import { cleanup, renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useThemeStore } from "../../../stores/theme-store";
import { useThemeSync } from "../use-theme-sync";

beforeEach(() => {
	document.documentElement.classList.remove("dark");
	useThemeStore.getState().reset();
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
	useThemeStore.getState().reset();
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

		renderHook(() => useThemeSync());
		expect(useThemeStore.getState().resolved).toBe("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});

	it("writes resolved=light and removes .dark when mode='light'", () => {
		document.documentElement.classList.add("dark");
		const hook = renderHook(() => useThemeSync());
		act(() => {
			useThemeStore.getState().setMode("light");
		});
		hook.rerender();
		expect(useThemeStore.getState().resolved).toBe("light");
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("flips to dark when mode='dark' regardless of system preference", () => {
		const hook = renderHook(() => useThemeSync());
		act(() => {
			useThemeStore.getState().setMode("dark");
		});
		hook.rerender();
		expect(useThemeStore.getState().resolved).toBe("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});
});
