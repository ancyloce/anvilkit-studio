/**
 * @file `EditorI18nProvider` — `config.i18n.messages` overlay precedence
 * (config-centric i18n §4.4).
 *
 * Resolution layers, lowest → highest:
 *   1. catalog (core `en` baseline + lazy packs + plugin entries)
 *   2. config fallback-locale bundle (back-fill, only when distinct)
 *   3. config active-locale bundle
 *   4. deprecated flat `<Studio messages>` prop (migration window)
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EditorStoreProvider } from "@/state/EditorStoreProvider";
import { EditorI18nProvider, useMsg } from "@/state/editor-i18n-context";
import {
	createEditorStore,
	type EditorStoreBundle,
} from "@/state/editor-store-bundle";

afterEach(cleanup);

function createWrapper(
	storeId: string,
	bundle: EditorStoreBundle,
	providerProps: {
		messages?: Readonly<Record<string, string>>;
		configMessages?: Readonly<Record<string, Readonly<Record<string, string>>>>;
		fallbackLocale?: string;
	},
): ({ children }: { children: ReactNode }) => ReactNode {
	return ({ children }) => (
		<EditorStoreProvider storeId={storeId} store={bundle}>
			<EditorI18nProvider {...providerProps}>{children}</EditorI18nProvider>
		</EditorStoreProvider>
	);
}

describe("EditorI18nProvider — config message precedence", () => {
	it("active-locale config bundle beats the catalog; falls back per key", async () => {
		const storeId = "cfg-msg-active";
		const bundle = createEditorStore({ storeId });
		const { result } = renderHook(() => useMsg(), {
			wrapper: createWrapper(storeId, bundle, {
				configMessages: {
					en: { "studio.publish": "Ship it" },
				},
			}),
		});
		await waitFor(() => expect(typeof result.current).toBe("function"));

		// Config override wins over the core catalog…
		expect(result.current("studio.publish")).toBe("Ship it");
		// …while un-overridden keys keep resolving from the catalog.
		expect(result.current("studio.language.label")).toBe("Language");
	});

	it("fallbackLocale bundle back-fills keys the active bundle lacks", async () => {
		const storeId = "cfg-msg-fallback";
		const bundle = createEditorStore({ storeId });
		const { result } = renderHook(() => useMsg(), {
			wrapper: createWrapper(storeId, bundle, {
				fallbackLocale: "en",
				configMessages: {
					en: {
						"demo.only.key": "EN fallback",
						"demo.both.key": "EN both",
					},
					fr: { "demo.both.key": "FR both" },
				},
			}),
		});
		await waitFor(() => expect(typeof result.current).toBe("function"));

		act(() => {
			bundle.locale.getState().setLocale("fr");
		});

		// Active "fr" bundle wins where present…
		await waitFor(() =>
			expect(result.current("demo.both.key")).toBe("FR both"),
		);
		// …and the "en" fallback bundle back-fills the missing key.
		expect(result.current("demo.only.key")).toBe("EN fallback");
	});

	it("the deprecated flat messages prop still wins over config bundles", async () => {
		const storeId = "cfg-msg-prop-wins";
		const bundle = createEditorStore({ storeId });
		const { result } = renderHook(() => useMsg(), {
			wrapper: createWrapper(storeId, bundle, {
				messages: { "studio.publish": "Prop wins" },
				configMessages: {
					en: { "studio.publish": "Config loses" },
				},
			}),
		});
		await waitFor(() => expect(typeof result.current).toBe("function"));
		expect(result.current("studio.publish")).toBe("Prop wins");
	});

	it("prop-only hosts resolve byte-identically (no config bundles)", async () => {
		const storeId = "cfg-msg-prop-only";
		const bundle = createEditorStore({ storeId });
		const { result } = renderHook(() => useMsg(), {
			wrapper: createWrapper(storeId, bundle, {
				messages: { "x.custom": "Custom" },
			}),
		});
		await waitFor(() => expect(typeof result.current).toBe("function"));
		expect(result.current("x.custom")).toBe("Custom");
		expect(result.current("studio.publish")).toBe("Publish");
		// Unknown key → caller fallback → the key itself.
		expect(result.current("no.such.key", "fb")).toBe("fb");
		expect(result.current("no.such.key")).toBe("no.such.key");
	});

	it("config bundles follow a live locale switch (reactive overlay)", async () => {
		const storeId = "cfg-msg-switch";
		const bundle = createEditorStore({ storeId });
		const { result } = renderHook(() => useMsg(), {
			wrapper: createWrapper(storeId, bundle, {
				configMessages: {
					en: { "demo.greeting": "Hello" },
					zh: { "demo.greeting": "你好" },
				},
			}),
		});
		await waitFor(() => expect(typeof result.current).toBe("function"));
		expect(result.current("demo.greeting")).toBe("Hello");

		act(() => {
			bundle.locale.getState().setLocale("zh");
		});
		await waitFor(() => expect(result.current("demo.greeting")).toBe("你好"));
	});
});
