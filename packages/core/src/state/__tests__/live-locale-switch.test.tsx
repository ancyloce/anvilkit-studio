/**
 * @file Live locale-switch reactivity through the real provider chain
 * (`EditorStoreProvider` → `EditorI18nProvider` → consumers), wired the
 * way `<Studio>` wires it.
 *
 * Regression coverage for the gap behind "switching the language does
 * nothing": the store/notify mechanics and the recompile carve-out were
 * tested, but no test asserted that a live `requestLocale` actually
 * re-resolves `useMsg` strings (catalog reload included).
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { EditorStoreProvider } from "../EditorStoreProvider";
import { EditorI18nProvider, useMsg } from "../editor-i18n-context";
import { useLocaleStore } from "../slices/LocaleStoreProvider";

afterEach(cleanup);

function Probe() {
	const msg = useMsg();
	const requestLocale = useLocaleStore((s) => s.requestLocale);
	return (
		<button type="button" onClick={() => requestLocale("zh")}>
			{msg("studio.language.label")}
		</button>
	);
}

it("live requestLocale('zh') re-resolves chrome strings via the lazy pack", async () => {
	render(
		<EditorStoreProvider storeId="live-locale-switch-test">
			<EditorI18nProvider>
				<Probe />
			</EditorI18nProvider>
		</EditorStoreProvider>,
	);

	const button = await screen.findByText("Language");
	act(() => {
		button.click();
	});

	// The zh pack lazy-loads; findByText polls until the catalog upgrades.
	await expect(screen.findByText("语言")).resolves.toBeTruthy();
});
