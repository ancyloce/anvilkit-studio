/**
 * @file Locale seeding from `studioConfig.i18n.locale` (P3-T2).
 *
 * `useHydrateRuntimeStores` seeds the per-instance locale store from the
 * resolved config locale — but only when the user has no persisted choice,
 * mirroring the theme `defaultMode` gate. Because the locale store uses
 * `skipHydration`, the seeding is registered via `onFinishHydration`; a bare
 * controller mount has no `EditorStoreProvider` to rehydrate it, so the test
 * drives `persist.rehydrate()` itself to fire the listener.
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useStudioController } from "@/components/use-studio-controller";

const PUCK_CONFIG = { components: {} };

beforeEach(() => {
	localStorage.clear();
});

afterEach(cleanup);

describe("useStudioController — locale seeding from config (P3)", () => {
	it("seeds the locale store from studioConfig.i18n.locale when unpersisted", async () => {
		const { result, unmount } = renderHook(() =>
			useStudioController({
				puckConfig: PUCK_CONFIG,
				chrome: "puck",
				config: { i18n: { locale: "zh" } },
			}),
		);
		// Wait for the async compile so the hydrate effect (which depends on
		// `compiled`) has run and registered the onFinishHydration seeder.
		await waitFor(() => expect(result.current.compiled).not.toBeNull());

		// No provider rehydrates the store in a bare controller mount, so fire
		// rehydration here — that triggers the seeding listener.
		await act(async () => {
			await result.current.editorStore.locale.persist.rehydrate();
		});

		await waitFor(() =>
			expect(result.current.editorStore.locale.getState().locale).toBe("zh"),
		);
		unmount();
	});

	it("does not clobber a persisted user locale choice", async () => {
		// Pre-persist a user choice of "ja" under the deterministic store key.
		localStorage.setItem(
			"anvilkit-core-locale-seed-keep",
			JSON.stringify({ state: { locale: "ja" }, version: 1 }),
		);

		const { result, unmount } = renderHook(() =>
			useStudioController({
				puckConfig: PUCK_CONFIG,
				chrome: "puck",
				storeId: "seed-keep",
				config: { i18n: { locale: "zh" } },
			}),
		);
		await waitFor(() => expect(result.current.compiled).not.toBeNull());

		await act(async () => {
			await result.current.editorStore.locale.persist.rehydrate();
		});

		// Rehydration loads "ja"; the seeder sees a non-"en" persisted value
		// and skips — the config "zh" must NOT override the user's choice.
		await waitFor(() =>
			expect(result.current.editorStore.locale.getState().locale).toBe("ja"),
		);
		unmount();
	});

	it("leaves the store at the default when config locale is the default 'en'", async () => {
		const { result, unmount } = renderHook(() =>
			useStudioController({ puckConfig: PUCK_CONFIG, chrome: "puck" }),
		);
		await waitFor(() => expect(result.current.compiled).not.toBeNull());
		await act(async () => {
			await result.current.editorStore.locale.persist.rehydrate();
		});
		expect(result.current.editorStore.locale.getState().locale).toBe("en");
		unmount();
	});
});

describe("useStudioController — ctx.t (P4)", () => {
	it("resolves a core key against the config locale; unknown key falls back", async () => {
		const { result, unmount } = renderHook(() =>
			useStudioController({ puckConfig: PUCK_CONFIG, chrome: "puck" }),
		);
		await waitFor(() => expect(result.current.compiled).not.toBeNull());
		const ctx = result.current.compiled?.ctx;
		expect(ctx).toBeDefined();
		expect(ctx?.t("studio.publish")).toBe("Publish");
		expect(ctx?.t("no.such.key")).toBe("no.such.key");
		unmount();
	});

	it("applies config.i18n.messages overrides with {token} interpolation", async () => {
		const { result, unmount } = renderHook(() =>
			useStudioController({
				puckConfig: PUCK_CONFIG,
				chrome: "puck",
				config: { i18n: { messages: { en: { "x.greet": "Hi {name}" } } } },
			}),
		);
		await waitFor(() => expect(result.current.compiled).not.toBeNull());
		const ctx = result.current.compiled?.ctx;
		expect(ctx?.t("x.greet", { name: "Ada" })).toBe("Hi Ada");
		unmount();
	});
});
