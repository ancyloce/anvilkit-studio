/**
 * @file `<LocaleSwitchRegion>` — the config-gated built-in language
 * switcher in the chrome header (config-centric i18n §4.5).
 *
 * The region mirrors `<CollaboratorsSlotRegion>`'s defensive two-level
 * pattern: outside `<Studio>` (no plugin context) it renders nothing;
 * inside, it renders the `<LanguageSwitcher>` iff
 * `config.i18n.showLocaleSwitch` is true (default false ⇒ additive no-op
 * for existing mounts). Exported from `StudioHeader.tsx` for exactly this
 * focused mount — the full header would drag in chrome-props / export
 * store / pages providers.
 */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioConfigProvider } from "@/config/provider";
import { StudioConfigSchema } from "@/config/schema";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import { LocaleSwitchRegion } from "@/layout/StudioHeader";
import { EditorStoreProvider } from "@/state/EditorStoreProvider";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import { createEditorStore } from "@/state/editor-store-bundle";
import type { StudioPluginContext } from "@/types/plugin";

afterEach(cleanup);

function createCtx(): StudioPluginContext {
	return {
		getData: () => ({ root: { props: {} }, content: [], zones: {} }),
		getPuckApi: () => ({}) as ReturnType<StudioPluginContext["getPuckApi"]>,
		studioConfig: StudioConfigSchema.parse({}),
		log: vi.fn(),
		emit: () => undefined,
		t: (key) => key,
		registerMessages: () => undefined,
		registerAssetResolver: () => undefined,
	};
}

function renderRegion(showLocaleSwitch: boolean, storeId: string) {
	// Created OUTSIDE the component tree (stable identities across
	// re-renders, mirroring how `<Studio>` owns its bundle).
	const config = StudioConfigSchema.parse({ i18n: { showLocaleSwitch } });
	const bundle = createEditorStore({ storeId });
	const ctx = createCtx();
	return render(
		<StudioConfigProvider config={config}>
			<StudioPluginContextProvider value={ctx}>
				<EditorStoreProvider storeId={storeId} store={bundle}>
					<EditorI18nProvider>
						<LocaleSwitchRegion />
					</EditorI18nProvider>
				</EditorStoreProvider>
			</StudioPluginContextProvider>
		</StudioConfigProvider>,
	);
}

describe("<LocaleSwitchRegion>", () => {
	it("renders nothing outside <Studio> (no plugin context)", () => {
		const { container } = render(<LocaleSwitchRegion />);
		expect(container.childElementCount).toBe(0);
	});

	it("renders nothing when showLocaleSwitch is off (the default)", async () => {
		const { container } = renderRegion(false, "region-off");
		// The hydration-gated store provider resolves in a microtask; assert
		// the settled state.
		await Promise.resolve();
		expect(container.querySelector("button")).toBeNull();
	});

	it("renders the LanguageSwitcher when showLocaleSwitch is on", async () => {
		renderRegion(true, "region-on");
		// `studio.language.label` resolves to "Language" (the trigger's
		// aria-label) once the locale store hydrates and the subtree mounts.
		// `findByRole` itself throws when absent — the assertion is the await.
		const trigger = await screen.findByRole("button", { name: "Language" });
		expect(trigger.getAttribute("aria-label")).toBe("Language");
	});
});
