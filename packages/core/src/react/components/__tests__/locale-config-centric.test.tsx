/**
 * @file Config-centric i18n — the load-bearing invariants.
 *
 * 1. **No-recompile carve-out (the tripwire):** a `config` change touching
 *    ONLY `i18n.*` must not re-run the plugin compile (no `register`
 *    re-invocation, no teardown of register-allocated resources such as a
 *    collab transport), while a non-`i18n` change still recompiles.
 * 2. **`onLocaleChange` flows:** uncontrolled `requestLocale` applies +
 *    notifies; controlled `requestLocale` notifies WITHOUT writing
 *    (controlled-`<input>` semantics).
 * 3. **`<Studio messages>` deprecation warning** fires exactly once.
 */

import {
	act,
	cleanup,
	render,
	renderHook,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Studio } from "@/components/Studio";
import { useStudioController } from "@/components/use-studio-controller";
import type { StudioPlugin, StudioPluginMeta } from "@/types/plugin";

vi.mock("@puckeditor/core", () => ({
	Puck: () => <div data-testid="puck-mock" />,
	useGetPuck: () => () => ({
		appState: { data: null },
		dispatch: () => undefined,
	}),
	createUsePuck: () => () => undefined,
}));

afterEach(() => {
	vi.restoreAllMocks();
	cleanup();
});

function meta(id: string): StudioPluginMeta {
	return { id, name: id, version: "1.0.0", coreVersion: "^0.1.0" };
}

const PUCK_CONFIG = { components: {} };

describe("<Studio> — config.i18n is recompile-exempt (carve-out tripwire)", () => {
	it("an i18n-only config change does NOT recompile; a non-i18n change does", async () => {
		const register = vi.fn(() => ({ meta: meta("com.test.i18n-exempt") }));
		const plugin: StudioPlugin = {
			meta: meta("com.test.i18n-exempt"),
			register,
		};

		const { container, rerender } = render(
			<Studio
				puckConfig={PUCK_CONFIG}
				plugins={[plugin]}
				config={{ i18n: { locale: "en" } }}
			/>,
		);
		await waitFor(() => {
			expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
		});
		expect(register).toHaveBeenCalledTimes(1);

		// Brand-new config object, differing ONLY inside `i18n` (locale flip
		// + switcher flag) — the stripped fingerprint is unchanged, so the
		// compiled runtime must survive.
		rerender(
			<Studio
				puckConfig={PUCK_CONFIG}
				plugins={[plugin]}
				config={{ i18n: { locale: "zh", showLocaleSwitch: true } }}
			/>,
		);
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(register).toHaveBeenCalledTimes(1);

		// Control: a non-i18n key change must still recompile.
		rerender(
			<Studio
				puckConfig={PUCK_CONFIG}
				plugins={[plugin]}
				config={{
					features: { enableExport: true },
					i18n: { locale: "zh", showLocaleSwitch: true },
				}}
			/>,
		);
		await waitFor(() => {
			expect(register).toHaveBeenCalledTimes(2);
		});
	});
});

describe("useStudioController — onLocaleChange flows", () => {
	it("uncontrolled: requestLocale applies the switch AND notifies", async () => {
		const onLocaleChange = vi.fn();
		const { result, unmount } = renderHook(() =>
			useStudioController({
				puckConfig: PUCK_CONFIG,
				chrome: "puck",
				onLocaleChange,
			}),
		);
		await waitFor(() => expect(result.current.compiled).not.toBeNull());

		act(() => {
			result.current.editorStore.locale.getState().requestLocale("zh");
		});
		expect(result.current.editorStore.locale.getState().locale).toBe("zh");
		expect(onLocaleChange).toHaveBeenCalledExactlyOnceWith("zh");
		unmount();
	});

	it("controlled: requestLocale notifies WITHOUT writing; the host applies via config", async () => {
		const onLocaleChange = vi.fn();
		const { result, rerender, unmount } = renderHook(
			({ locale }: { locale: string }) =>
				useStudioController({
					puckConfig: PUCK_CONFIG,
					chrome: "puck",
					config: { i18n: { locale } },
					onLocaleChange,
				}),
			{ initialProps: { locale: "zh" } },
		);
		await waitFor(() => expect(result.current.compiled).not.toBeNull());

		act(() => {
			result.current.editorStore.locale.getState().requestLocale("ja");
		});
		// Controlled-input semantics: the request alone changes nothing…
		expect(result.current.editorStore.locale.getState().locale).toBe("zh");
		expect(onLocaleChange).toHaveBeenCalledExactlyOnceWith("ja");

		// …the host applies it by re-rendering with the new config value.
		rerender({ locale: "ja" });
		await waitFor(() =>
			expect(result.current.editorStore.locale.getState().locale).toBe("ja"),
		);
		unmount();
	});

	it("reads the latest onLocaleChange identity (inline handlers never recompile)", async () => {
		const first = vi.fn();
		const second = vi.fn();
		const { result, rerender, unmount } = renderHook(
			({ handler }: { handler: (locale: string) => void }) =>
				useStudioController({
					puckConfig: PUCK_CONFIG,
					chrome: "puck",
					onLocaleChange: handler,
				}),
			{ initialProps: { handler: first } },
		);
		await waitFor(() => expect(result.current.compiled).not.toBeNull());

		rerender({ handler: second });
		act(() => {
			result.current.editorStore.locale.getState().requestLocale("zh");
		});
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledExactlyOnceWith("zh");
		unmount();
	});
});

describe("useStudioController — <Studio messages> deprecation warning", () => {
	it("warns exactly once through the logger sink", async () => {
		const logger = vi.fn();
		const { result, rerender, unmount } = renderHook(
			({ tick }: { tick: number }) =>
				useStudioController({
					puckConfig: PUCK_CONFIG,
					chrome: "puck",
					logger,
					// Inline object: a fresh identity per render must not re-warn.
					messages: { "x.k": `v${tick}` },
				}),
			{ initialProps: { tick: 0 } },
		);
		await waitFor(() => expect(result.current.compiled).not.toBeNull());
		rerender({ tick: 1 });
		rerender({ tick: 2 });

		const deprecationWarns = logger.mock.calls.filter(
			([level, message]) =>
				level === "warn" &&
				typeof message === "string" &&
				message.includes("<Studio messages> is deprecated"),
		);
		expect(deprecationWarns).toHaveLength(1);
		unmount();
	});

	it("does not warn when the prop is absent", async () => {
		const logger = vi.fn();
		const { result, unmount } = renderHook(() =>
			useStudioController({
				puckConfig: PUCK_CONFIG,
				chrome: "puck",
				logger,
			}),
		);
		await waitFor(() => expect(result.current.compiled).not.toBeNull());
		const deprecationWarns = logger.mock.calls.filter(
			([, message]) =>
				typeof message === "string" && message.includes("deprecated"),
		);
		expect(deprecationWarns).toHaveLength(0);
		unmount();
	});
});
