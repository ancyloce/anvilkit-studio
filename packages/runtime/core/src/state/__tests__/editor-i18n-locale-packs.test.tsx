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
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RegistryEntry } from "@/i18n/registry";
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

describe("locale-pack load failure logging (P3)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function makeFailingEntry(boom: Error): RegistryEntry {
		return {
			namespace: "test-fail",
			en: { "test-fail.k": "v" },
			loadMessages: async () => {
				throw boom;
			},
		};
	}

	it("routes the failure through the provided logger (not console)", async () => {
		const logger = vi.fn();
		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);
		const boom = new Error("pack boom");
		const storeId = "i18n-logger-route";
		const bundle = createEditorStore({ storeId });
		const wrapper = ({ children }: { children: ReactNode }) => (
			<EditorStoreProvider storeId={storeId} store={bundle}>
				<EditorI18nProvider entries={[makeFailingEntry(boom)]} logger={logger}>
					{children}
				</EditorI18nProvider>
			</EditorStoreProvider>
		);
		const { result } = renderHook(() => useMsg(), { wrapper });
		await waitFor(() => expect(typeof result.current).toBe("function"));

		act(() => {
			bundle.locale.getState().setLocale("zh");
		});

		await waitFor(() => expect(logger).toHaveBeenCalled());
		const call = logger.mock.calls.find(
			(c) => typeof c[1] === "string" && c[1].includes("test-fail:zh"),
		);
		expect(call).toBeDefined();
		expect(call?.[0]).toBe("warn");
		expect(call?.[2]).toMatchObject({ error: boom });
		// The logger replaced the raw console.warn for this failure.
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("falls back to console.warn when no logger is provided", async () => {
		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);
		const boom = new Error("pack boom");
		const storeId = "i18n-logger-fallback";
		const bundle = createEditorStore({ storeId });
		const wrapper = ({ children }: { children: ReactNode }) => (
			<EditorStoreProvider storeId={storeId} store={bundle}>
				<EditorI18nProvider entries={[makeFailingEntry(boom)]}>
					{children}
				</EditorI18nProvider>
			</EditorStoreProvider>
		);
		const { result } = renderHook(() => useMsg(), { wrapper });
		await waitFor(() => expect(typeof result.current).toBe("function"));

		act(() => {
			bundle.locale.getState().setLocale("zh");
		});

		await waitFor(() =>
			expect(
				warnSpy.mock.calls.some(
					(c) => typeof c[0] === "string" && c[0].includes("test-fail:zh"),
				),
			).toBe(true),
		);
	});
});
