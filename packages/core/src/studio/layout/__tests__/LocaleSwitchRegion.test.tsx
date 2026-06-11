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

function Harness({
	showLocaleSwitch,
	storeId,
}: {
	readonly showLocaleSwitch: boolean;
	readonly storeId: string;
}): ReactNode {
	const config = StudioConfigSchema.parse({ i18n: { showLocaleSwitch } });
	const bundle = createEditorStore({ storeId });
	return (
		<StudioConfigProvider config={config}>
			<StudioPluginContextProvider value={createCtx()}>
				<EditorStoreProvider storeId={storeId} store={bundle}>
					<EditorI18nProvider>
						<LocaleSwitchRegion />
					</EditorI18nProvider>
				</EditorStoreProvider>
			</StudioPluginContextProvider>
		</StudioConfigProvider>
	);
}

describe("<LocaleSwitchRegion>", () => {
	it("renders nothing outside <Studio> (no plugin context)", () => {
		const { container } = render(<LocaleSwitchRegion />);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders nothing when showLocaleSwitch is off (the default)", async () => {
		const { container } = render(
			<Harness showLocaleSwitch={false} storeId="region-off" />,
		);
		// The hydration-gated store provider resolves in a microtask; assert
		// the settled state.
		await Promise.resolve();
		expect(container.querySelector("button")).toBeNull();
	});

	it("renders the LanguageSwitcher when showLocaleSwitch is on", async () => {
		render(<Harness showLocaleSwitch={true} storeId="region-on" />);
		// `studio.language.label` resolves to "Language" (the trigger's
		// aria-label) once the locale store hydrates and the subtree mounts.
		expect(
			await screen.findByRole("button", { name: "Language" }),
		).toBeInTheDocument();
	});
});
