/**
 * @file Integration: the editor-store bundle's `locale` slice drives the
 * i18n provider through the real `EditorStoreProvider` path (P1-T4).
 *
 * T3's switch test used a standalone `LocaleStoreProvider`; this proves the
 * production wiring instead — `EditorStoreProvider` supplies the bundle's
 * `LocaleStoreContext`, and `EditorI18nProvider` (a descendant, exactly as
 * mounted in `StudioProviderStack`) re-resolves `useMsg` when the bundle's
 * locale store switches, with no remount.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import type { MessageBundle, RegistryEntry } from "@/i18n/registry";
import { EditorStoreProvider } from "@/state/EditorStoreProvider";
import { EditorI18nProvider, useMsg } from "@/state/editor-i18n-context";
import { createEditorStore } from "@/state/editor-store-bundle";

const entries: readonly RegistryEntry[] = [
	{
		namespace: "demo",
		en: { "demo.greeting": "Hello" },
		loadMessages: async (locale): Promise<MessageBundle> =>
			locale === "zh" ? { "demo.greeting": "你好" } : {},
	},
];

describe("editor-store bundle → i18n provider wiring", () => {
	it("re-resolves useMsg when the bundle's locale store switches (no remount)", async () => {
		const bundle = createEditorStore({ storeId: "wire" });
		const wrapper = ({ children }: { children: ReactNode }) => (
			<EditorStoreProvider storeId="wire" store={bundle}>
				<EditorI18nProvider entries={entries}>{children}</EditorI18nProvider>
			</EditorStoreProvider>
		);
		const { result } = renderHook(() => useMsg(), { wrapper });
		await waitFor(() => expect(typeof result.current).toBe("function"));
		expect(result.current("demo.greeting")).toBe("Hello");

		act(() => {
			bundle.locale.getState().setLocale("zh");
		});
		await waitFor(() => expect(result.current("demo.greeting")).toBe("你好"));
	});

	it("two bundles keep independent locales (per-instance isolation, I5)", () => {
		const a = createEditorStore({ storeId: "iso-a" });
		const b = createEditorStore({ storeId: "iso-b" });
		a.locale.getState().setLocale("zh");
		b.locale.getState().setLocale("ja");
		expect(a.locale.getState().locale).toBe("zh");
		expect(b.locale.getState().locale).toBe("ja");
	});
});
