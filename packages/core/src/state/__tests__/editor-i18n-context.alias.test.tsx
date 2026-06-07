/**
 * @file `useMsg` resolution order + registry/locale reactivity.
 *
 * Locks the resolution order documented at the top of
 * `editor-i18n-context.tsx`:
 *
 *   1. catalog override of requested key
 *   2. default for requested key
 *   3. caller `fallback`
 *   4. the key itself
 *
 * The deprecated-alias step (`studio.tab.{insert,outline}` →
 * `studio.module.{insert,layer}.name`) was removed in P8 once consumers
 * migrated to the new keys.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import type { RegistryEntry } from "@/i18n/registry";
import { EditorI18nProvider, useMsg } from "@/state/editor-i18n-context";
import { LocaleStoreProvider } from "@/state/slices/LocaleStoreProvider";
import { createLocaleStore } from "@/state/slices/locale-store";

function wrap(messages?: Readonly<Record<string, string>>) {
	return ({ children }: { children: ReactNode }) => (
		<EditorI18nProvider messages={messages}>{children}</EditorI18nProvider>
	);
}

describe("useMsg — resolution order", () => {
	it("returns the default for a known key", () => {
		const { result } = renderHook(() => useMsg(), { wrapper: wrap() });
		expect(result.current("studio.module.insert.name")).toBe("Insert");
		expect(result.current("studio.module.layer.name")).toBe("Pages & Layers");
	});

	it("an explicit override wins over the default", () => {
		const { result } = renderHook(() => useMsg(), {
			wrapper: wrap({ "studio.module.insert.name": "Components" }),
		});
		expect(result.current("studio.module.insert.name")).toBe("Components");
	});

	it("falls through to fallback then to the key itself for unknown keys", () => {
		const { result } = renderHook(() => useMsg(), { wrapper: wrap() });
		expect(result.current("studio.unknown.key", "fallback")).toBe("fallback");
		expect(result.current("studio.unknown.key")).toBe("studio.unknown.key");
	});

	it("works without a provider via DEFAULT_MESSAGES", () => {
		const { result } = renderHook(() => useMsg());
		expect(result.current("studio.module.insert.name")).toBe("Insert");
		expect(result.current("studio.module.layer.name")).toBe("Pages & Layers");
	});
});

describe("useMsg — registry + locale reactivity", () => {
	function demoEntry(): RegistryEntry {
		return {
			namespace: "demo",
			en: { "demo.greeting": "Hello", "demo.only": "EN only" },
			loadMessages: async (locale) =>
				locale === "zh" ? { "demo.greeting": "你好" } : {},
		};
	}

	it("switches locale and re-resolves from a lazy pack without remounting", async () => {
		const store = createLocaleStore({ storeId: "switch" });
		const entries = [demoEntry()];
		const wrapper = ({ children }: { children: ReactNode }) => (
			<LocaleStoreProvider storeId="switch" store={store}>
				<EditorI18nProvider entries={entries}>{children}</EditorI18nProvider>
			</LocaleStoreProvider>
		);
		const { result } = renderHook(() => useMsg(), { wrapper });
		await waitFor(() => expect(typeof result.current).toBe("function"));
		expect(result.current("demo.greeting")).toBe("Hello");

		act(() => {
			store.getState().setLocale("zh");
		});
		await waitFor(() => expect(result.current("demo.greeting")).toBe("你好"));
		// A key absent from the zh pack falls back to the English baseline.
		expect(result.current("demo.only")).toBe("EN only");
	});

	it("layers the host `messages` prop over the resolved catalog (host wins)", () => {
		const wrapper = ({ children }: { children: ReactNode }) => (
			<EditorI18nProvider
				entries={[demoEntry()]}
				messages={{ "demo.greeting": "Hi!" }}
			>
				{children}
			</EditorI18nProvider>
		);
		const { result } = renderHook(() => useMsg(), { wrapper });
		expect(result.current("demo.greeting")).toBe("Hi!");
		// Non-overridden plugin keys still resolve from the catalog.
		expect(result.current("demo.only")).toBe("EN only");
	});

	it("defaults to English when no locale store is mounted", () => {
		const wrapper = ({ children }: { children: ReactNode }) => (
			<EditorI18nProvider entries={[demoEntry()]}>
				{children}
			</EditorI18nProvider>
		);
		const { result } = renderHook(() => useMsg(), { wrapper });
		// `useOptionalLocale()` returns "en" with no provider → no switch.
		expect(result.current("demo.greeting")).toBe("Hello");
	});

	it("prepends the core studio.* entry — plugin entries never replace it (P4)", () => {
		// `entries` is now plugin-only; the provider prepends the core entry
		// internally, so both plugin and chrome keys resolve.
		const wrapper = ({ children }: { children: ReactNode }) => (
			<EditorI18nProvider entries={[demoEntry()]}>
				{children}
			</EditorI18nProvider>
		);
		const { result } = renderHook(() => useMsg(), { wrapper });
		expect(result.current("demo.greeting")).toBe("Hello"); // plugin key
		expect(result.current("studio.publish")).toBe("Publish"); // core key
	});
});
