/**
 * @file Integration: the core `studio.*` registry entry now lazy-loads its
 * non-English packs.
 *
 * `DEFAULT_MESSAGES` moved out of an inline literal into
 * `i18n/messages/en.json`, and `STUDIO_CORE_ENTRY` gained a `loadMessages`
 * loader over sibling `zh` / `ja` / `ko` JSON packs. Before, switching the
 * locale left the chrome stuck at English (the core entry had no loader);
 * this proves the chrome catalog now upgrades in place on a locale switch,
 * with no `<Studio>` remount, and falls back to English for a locale that
 * has no pack.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { EditorStoreProvider } from "@/state/EditorStoreProvider";
import {
	DEFAULT_MESSAGES,
	EditorI18nProvider,
	useMsg,
} from "@/state/editor-i18n-context";
import { createEditorStore } from "@/state/editor-store-bundle";

describe("core studio.* locale packs", () => {
	it("sources DEFAULT_MESSAGES from en.json (English baseline)", () => {
		expect(DEFAULT_MESSAGES["studio.publish"]).toBe("Publish");
		expect(DEFAULT_MESSAGES["studio.language.label"]).toBe("Language");
	});

	it.each([
		["zh", "发布", "语言"],
		["ja", "公開", "言語"],
		["ko", "게시", "언어"],
	])("lazy-loads the %s chrome pack on locale switch", async (locale, publish, language) => {
		const storeId = `core-pack-${locale}`;
		const bundle = createEditorStore({ storeId });
		const wrapper = ({ children }: { children: ReactNode }) => (
			<EditorStoreProvider storeId={storeId} store={bundle}>
				<EditorI18nProvider>{children}</EditorI18nProvider>
			</EditorStoreProvider>
		);
		const { result } = renderHook(() => useMsg(), { wrapper });
		await waitFor(() => expect(typeof result.current).toBe("function"));

		// English baseline before the switch.
		expect(result.current("studio.publish")).toBe("Publish");

		act(() => {
			bundle.locale.getState().setLocale(locale);
		});

		await waitFor(() => expect(result.current("studio.publish")).toBe(publish));
		expect(result.current("studio.language.label")).toBe(language);
	});

	it("stays English for a locale with no pack (graceful fallback)", async () => {
		const storeId = "core-pack-none";
		const bundle = createEditorStore({ storeId });
		const wrapper = ({ children }: { children: ReactNode }) => (
			<EditorStoreProvider storeId={storeId} store={bundle}>
				<EditorI18nProvider>{children}</EditorI18nProvider>
			</EditorStoreProvider>
		);
		const { result } = renderHook(() => useMsg(), { wrapper });
		await waitFor(() => expect(typeof result.current).toBe("function"));

		act(() => {
			bundle.locale.getState().setLocale("fr");
		});

		// `loadMessages` resolves `{}` for an unknown locale, so the chrome
		// keeps its English baseline rather than throwing or blanking.
		await waitFor(() =>
			expect(result.current("studio.publish")).toBe("Publish"),
		);
	});
});
