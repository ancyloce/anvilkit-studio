/**
 * @file Locale resolution from `config.i18n.locale` (P3-T2, reshaped by the
 * config-centric i18n refactor).
 *
 * An **explicit** host `config.i18n.locale` now makes the mount
 * locale-CONTROLLED: the value is authoritative (seeded synchronously at
 * store creation, persistence bypassed, persisted choices ignored). The old
 * seed-once-if-unpersisted path survives for **uncontrolled** mounts whose
 * compiled config locale diverges from the raw prop — i.e. env
 * (`ANVILKIT_I18N__LOCALE`) — mirroring the theme `defaultMode` gate.
 * Because the locale store uses `skipHydration`, that seeding is registered
 * via `onFinishHydration`; a bare controller mount has no
 * `EditorStoreProvider` to rehydrate it, so the tests drive
 * `persist.rehydrate()` themselves to fire the listener.
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useStudioController } from "@/components/use-studio-controller";

const PUCK_CONFIG = { components: {} };

const ENV_LOCALE_KEY = "ANVILKIT_I18N__LOCALE";

function setEnvLocale(value: string | undefined): void {
	const env = (
		globalThis as unknown as { process?: { env?: Record<string, string> } }
	).process?.env;
	if (env === undefined) {
		throw new Error("process.env unavailable in this test environment");
	}
	if (value === undefined) {
		delete env[ENV_LOCALE_KEY];
	} else {
		env[ENV_LOCALE_KEY] = value;
	}
}

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	setEnvLocale(undefined);
	cleanup();
});

describe("useStudioController — controlled config.i18n.locale", () => {
	it("resolves an explicit config locale synchronously (controlled, no flash)", async () => {
		const { result, unmount } = renderHook(() =>
			useStudioController({
				puckConfig: PUCK_CONFIG,
				chrome: "puck",
				config: { i18n: { locale: "zh" } },
			}),
		);
		// Controlled mode seeds at store CREATION — before any compile or
		// hydration settles — so the first paint already shows "zh".
		expect(result.current.editorStore.locale.getState().locale).toBe("zh");

		await waitFor(() => expect(result.current.compiled).not.toBeNull());
		// Rehydration against the controlled no-op storage must be a no-op.
		await act(async () => {
			await result.current.editorStore.locale.persist.rehydrate();
		});
		expect(result.current.editorStore.locale.getState().locale).toBe("zh");
		unmount();
	});

	it("ignores a persisted user choice when config-controlled (config wins)", async () => {
		// Pre-persist a user choice of "ja" under the deterministic store key
		// — under the old seed-once semantics this beat the config locale;
		// controlled mode deliberately inverts that (the one intentional
		// semantic change of the config-centric refactor).
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

		expect(result.current.editorStore.locale.getState().locale).toBe("zh");
		// The bypassed blob is left untouched for a later uncontrolled mount.
		expect(
			JSON.parse(localStorage.getItem("anvilkit-core-locale-seed-keep") ?? "")
				.state.locale,
		).toBe("ja");
		unmount();
	});

	it("follows live config locale changes via the write-through effect", async () => {
		const { result, rerender, unmount } = renderHook(
			({ locale }: { locale: string }) =>
				useStudioController({
					puckConfig: PUCK_CONFIG,
					chrome: "puck",
					config: { i18n: { locale } },
				}),
			{ initialProps: { locale: "zh" } },
		);
		await waitFor(() => expect(result.current.compiled).not.toBeNull());

		rerender({ locale: "ja" });
		await waitFor(() =>
			expect(result.current.editorStore.locale.getState().locale).toBe("ja"),
		);
		unmount();
	});
});

describe("useStudioController — uncontrolled seeding (env path)", () => {
	it("seeds an env-resolved locale once when unpersisted", async () => {
		setEnvLocale("zh");
		const { result, unmount } = renderHook(() =>
			// No raw `config.i18n.locale` ⇒ uncontrolled; the compiled config
			// resolves the env layer, and the seed-once path applies it.
			useStudioController({ puckConfig: PUCK_CONFIG, chrome: "puck" }),
		);
		await waitFor(() => expect(result.current.compiled).not.toBeNull());

		await act(async () => {
			await result.current.editorStore.locale.persist.rehydrate();
		});

		await waitFor(() =>
			expect(result.current.editorStore.locale.getState().locale).toBe("zh"),
		);
		unmount();
	});

	it("does not clobber a persisted user locale choice (env stays a default)", async () => {
		setEnvLocale("zh");
		localStorage.setItem(
			"anvilkit-core-locale-env-keep",
			JSON.stringify({ state: { locale: "ja" }, version: 1 }),
		);

		const { result, unmount } = renderHook(() =>
			useStudioController({
				puckConfig: PUCK_CONFIG,
				chrome: "puck",
				storeId: "env-keep",
			}),
		);
		await waitFor(() => expect(result.current.compiled).not.toBeNull());

		await act(async () => {
			await result.current.editorStore.locale.persist.rehydrate();
		});

		// Rehydration loads "ja"; the seeder sees a non-"en" persisted value
		// and skips — the env "zh" must NOT override the user's choice.
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

	it("tracks the active locale + live config messages after a recompile-free change", async () => {
		const messages = {
			en: { "x.greet": "Hello" },
			zh: { "x.greet": "你好" },
		};
		const { result, rerender, unmount } = renderHook(
			({ locale }: { locale: string }) =>
				useStudioController({
					puckConfig: PUCK_CONFIG,
					chrome: "puck",
					config: { i18n: { locale, messages } },
				}),
			{ initialProps: { locale: "en" } },
		);
		await waitFor(() => expect(result.current.compiled).not.toBeNull());
		const ctx = result.current.compiled?.ctx;
		expect(ctx?.t("x.greet")).toBe("Hello");

		// Same compiled runtime (no recompile — `i18n` is carve-out-exempt),
		// yet ctx.t answers in the new language via the live locale store +
		// liveI18nRef.
		const runtimeBefore = result.current.compiled?.runtime;
		rerender({ locale: "zh" });
		await waitFor(() =>
			expect(result.current.editorStore.locale.getState().locale).toBe("zh"),
		);
		expect(result.current.compiled?.runtime).toBe(runtimeBefore);
		expect(ctx?.t("x.greet")).toBe("你好");
		unmount();
	});
});
