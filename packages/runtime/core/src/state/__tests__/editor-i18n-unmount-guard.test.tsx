/**
 * @file P2-2 regression: the lazy locale-pack loader must not touch a
 * provider that has already unmounted. A `loadMessages()` promise that
 * settles after `<EditorI18nProvider>` unmounts must skip both the
 * `setLoadedPacks` write (the success path) and the `console.warn` +
 * `requestedRef` mutation (the rejection path) — guarded by a
 * mount-lifetime flag.
 */

import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MessageBundle, RegistryEntry } from "@/i18n/registry";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import { LocaleStoreProvider } from "@/state/slices/LocaleStoreProvider";
import { createLocaleStore } from "@/state/slices/locale-store";

afterEach(cleanup);

describe("EditorI18nProvider — post-unmount load guard (P2-2)", () => {
	it("does not warn when a locale pack rejects after the provider unmounts", async () => {
		// A loader whose promise we settle by hand, after unmount.
		let rejectLoad!: (reason: unknown) => void;
		let loadCalls = 0;
		const deferred = new Promise<MessageBundle>((_, reject) => {
			rejectLoad = reject;
		});
		const entry: RegistryEntry = {
			namespace: "deferred",
			en: { "deferred.k": "v" },
			loadMessages: () => {
				loadCalls += 1;
				return deferred;
			},
		};

		// Non-`en` locale so the loader is invoked on mount.
		const store = createLocaleStore({ storeId: "p2-2-unmount" });
		store.getState().setLocale("zh");

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
			/* swallow */
		});

		const view = render(
			<LocaleStoreProvider storeId="p2-2-unmount" store={store}>
				<EditorI18nProvider entries={[entry]}>
					<div data-testid="child" />
				</EditorI18nProvider>
			</LocaleStoreProvider>,
		);

		// The mount effect should have requested the pack.
		expect(loadCalls).toBeGreaterThan(0);

		view.unmount();

		// Settle the load *after* unmount; without the guard this hits the
		// `.catch` and logs a warning against a dead provider.
		await act(async () => {
			rejectLoad(new Error("late pack failure"));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(warnSpy).not.toHaveBeenCalled();
		warnSpy.mockRestore();
	});
});
