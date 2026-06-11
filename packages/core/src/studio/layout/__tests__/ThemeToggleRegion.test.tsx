/**
 * @file `<ThemeToggleRegion>` — the config-gated built-in theme toggle in
 * the chrome header (the renderer behind `config.theme.allowToggle`).
 *
 * Mirrors `LocaleSwitchRegion.test.tsx`: defensive two-level pattern
 * (nothing outside `<Studio>`), gated on the config flag — which, unlike
 * `i18n.showLocaleSwitch`, defaults to **true** (the shipped core-011
 * schema contract, honored by a renderer for the first time here).
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioConfigProvider } from "@/config/provider";
import { StudioConfigSchema } from "@/config/schema";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import { ThemeToggleRegion } from "@/layout/StudioHeader";
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

function renderRegion(allowToggle: boolean, storeId: string) {
	const config = StudioConfigSchema.parse({ theme: { allowToggle } });
	const bundle = createEditorStore({ storeId });
	const ctx = createCtx();
	const result = render(
		<StudioConfigProvider config={config}>
			<StudioPluginContextProvider value={ctx}>
				<EditorStoreProvider storeId={storeId} store={bundle}>
					<EditorI18nProvider>
						<ThemeToggleRegion />
					</EditorI18nProvider>
				</EditorStoreProvider>
			</StudioPluginContextProvider>
		</StudioConfigProvider>,
	);
	return { ...result, bundle };
}

describe("<ThemeToggleRegion>", () => {
	it("renders nothing outside <Studio> (no plugin context)", () => {
		const { container } = render(<ThemeToggleRegion />);
		expect(container.childElementCount).toBe(0);
	});

	it("renders nothing when allowToggle is false", async () => {
		const { container } = renderRegion(false, "theme-region-off");
		// The hydration-gated store provider resolves in a microtask; assert
		// the settled state.
		await Promise.resolve();
		expect(container.querySelector("button")).toBeNull();
	});

	it("renders the ThemeToggle when allowToggle is on (the schema default)", async () => {
		// Explicitly parse `{}` to prove the DEFAULT config opens the gate.
		expect(StudioConfigSchema.parse({}).theme.allowToggle).toBe(true);

		renderRegion(true, "theme-region-on");
		// `studio.theme.label` resolves to "Theme" (the trigger's aria-label).
		const trigger = await screen.findByRole("button", { name: "Theme" });
		expect(trigger.getAttribute("aria-label")).toBe("Theme");
	});

	it("trigger icon follows the mode preference (system → light)", async () => {
		const { bundle } = renderRegion(true, "theme-region-icon");
		const trigger = await screen.findByRole("button", { name: "Theme" });
		// `system` preference renders the Monitor icon (lucide stamps the
		// icon name onto the SVG class).
		expect(trigger.querySelector("svg.lucide-monitor")).not.toBeNull();

		bundle.theme.getState().setMode("light");
		const sun = await screen.findByRole("button", { name: "Theme" });
		expect(sun.querySelector("svg.lucide-sun")).not.toBeNull();
	});
});
