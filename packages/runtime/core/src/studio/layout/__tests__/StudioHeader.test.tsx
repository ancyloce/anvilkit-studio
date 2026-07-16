/**
 * @file Integration tests for the Phase 2 `<StudioHeader>` rewrite:
 * left-aligned breadcrumb, compact save-status chip, Share gated on
 * collaboration-slot presence, and the compact system (Theme/Locale)
 * menu. Pure-logic pieces (`selectCollaboratorsSlot`,
 * `hasHeaderActionCapability`) already have their own focused test
 * files; this one covers how the header composes them.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioRuntimeProvider } from "@/components/use-studio";
import { StudioConfigProvider } from "@/config/provider";
import { StudioConfigSchema } from "@/config/schema";
import { type ChromeProps, ChromePropsProvider } from "@/context/chrome-props";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import { StudioHeader } from "@/layout/StudioHeader";
import type { StudioRuntime } from "@/runtime/compile-plugins";
import { EditorStoreProvider } from "@/state/EditorStoreProvider";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import { createEditorStore } from "@/state/editor-store-bundle";
import type {
	StudioPluginContext,
	StudioPluginSlotContribution,
} from "@/types/plugin";

const { historyBack, historyForward } = vi.hoisted(() => ({
	historyBack: vi.fn(),
	historyForward: vi.fn(),
}));

vi.mock("@puckeditor/core", () => ({
	useGetPuck: () => () => ({
		appState: { data: null },
		history: { back: historyBack, forward: historyForward },
	}),
}));

afterEach(() => {
	cleanup();
	historyBack.mockReset();
	historyForward.mockReset();
});

function fakeCtx(): StudioPluginContext {
	return {
		getData: () => ({ root: { props: {} }, content: [], zones: {} }),
		getPuckApi: () => ({}) as ReturnType<StudioPluginContext["getPuckApi"]>,
		studioConfig: StudioConfigSchema.parse({}),
		log: vi.fn(),
		emit: () => undefined,
		on: () => () => undefined,
		t: (key) => key,
		registerMessages: () => undefined,
		registerAssetResolver: () => undefined,
	};
}

function fakeRuntime(overrides: Partial<StudioRuntime> = {}): StudioRuntime {
	return {
		pluginMeta: [],
		registrations: [],
		lifecycle: {} as StudioRuntime["lifecycle"],
		exportFormats: new Map(),
		assetResolvers: [],
		headerActions: [],
		overrides: [],
		providers: [],
		overlays: [],
		slots: new Map(),
		puckPlugins: [],
		sidebar: {} as StudioRuntime["sidebar"],
		i18n: { entries: [] },
		...overrides,
	};
}

function Setup({
	children,
	config = {},
	runtime = fakeRuntime(),
	chromeProps = {},
	storeId = `header-${Math.random().toString(36).slice(2)}`,
}: {
	readonly children: ReactNode;
	readonly config?: Parameters<typeof StudioConfigSchema.parse>[0];
	readonly runtime?: StudioRuntime;
	readonly chromeProps?: ChromeProps;
	readonly storeId?: string;
}): ReactElement {
	const parsedConfig = StudioConfigSchema.parse(config);
	const bundle = createEditorStore({ storeId });
	return (
		<StudioConfigProvider config={parsedConfig}>
			<StudioPluginContextProvider value={fakeCtx()}>
				<StudioRuntimeProvider value={runtime}>
					<EditorStoreProvider storeId={storeId} store={bundle}>
						<EditorI18nProvider>
							<ChromePropsProvider value={chromeProps}>
								{children}
							</ChromePropsProvider>
						</EditorI18nProvider>
					</EditorStoreProvider>
				</StudioRuntimeProvider>
			</StudioPluginContextProvider>
		</StudioConfigProvider>
	);
}

function collaboratorsSlot(): ReadonlyMap<
	string,
	StudioPluginSlotContribution
> {
	return new Map([
		["collaborators", { id: "collaborators", component: () => null }],
	]);
}

describe("<StudioHeader> layout", () => {
	it("left-aligns the breadcrumb instead of centering it", () => {
		render(
			<Setup>
				<StudioHeader />
			</Setup>,
		);
		const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
		expect(nav.className).not.toMatch(/justify-center/);
	});
});

describe("<StudioHeader> save-status chip", () => {
	it.each([
		[{ isSavingDraft: true }, "Saving…"],
		[{ isSavingDraft: false, saveError: new Error("boom") }, "Error"],
		[{ isSavingDraft: false, lastSavedAt: new Date() }, "Saved"],
		[{ isSavingDraft: false, lastSavedAt: null }, "Unsaved"],
	] as const)("renders %o as %s", (props, expected) => {
		render(
			<Setup>
				<StudioHeader {...props} />
			</Setup>,
		);
		expect(screen.getByText(expected)).not.toBeNull();
	});

	it("does not render the old always-visible relative-time text", () => {
		render(
			<Setup>
				<StudioHeader lastSavedAt={new Date()} />
			</Setup>,
		);
		expect(screen.queryByText(/^Saved \d/)).toBeNull();
	});
});

describe("<StudioHeader> Share region", () => {
	it("hides Share when no collaboration plugin fills the collaborators slot", () => {
		render(
			<Setup>
				<StudioHeader />
			</Setup>,
		);
		expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
	});

	it("shows Share disabled when the slot is filled but onShare is unwired", () => {
		render(
			<Setup runtime={fakeRuntime({ slots: collaboratorsSlot() })}>
				<StudioHeader />
			</Setup>,
		);
		const share = screen.getByRole("button", { name: "Share" });
		expect(share).toBeDisabled();
	});

	it("enables Share and invokes onShare when wired", () => {
		const onShare = vi.fn();
		render(
			<Setup
				runtime={fakeRuntime({ slots: collaboratorsSlot() })}
				chromeProps={{ onShare }}
			>
				<StudioHeader />
			</Setup>,
		);
		const share = screen.getByRole("button", { name: "Share" });
		expect(share).not.toBeDisabled();
		fireEvent.click(share);
		expect(onShare).toHaveBeenCalledTimes(1);
	});
});

describe("<StudioHeader> undo/redo (relocated from the removed StudioToolbar, task Phase 3)", () => {
	it("invokes Puck history back/forward", () => {
		render(
			<Setup>
				<StudioHeader />
			</Setup>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Undo" }));
		expect(historyBack).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByRole("button", { name: "Redo" }));
		expect(historyForward).toHaveBeenCalledTimes(1);
	});
});

describe("<StudioHeader> Focus Mode toggle (relocated from the removed StudioToolbar, task Phase 3)", () => {
	it("is an accessible, keyboard-operable toggle with aria-pressed state", () => {
		render(
			<Setup>
				<StudioHeader />
			</Setup>,
		);
		const toggle = screen.getByRole("button", { name: "Focus mode" });
		expect(toggle).toHaveAttribute("aria-pressed", "false");
		fireEvent.click(toggle);
		expect(toggle).toHaveAttribute("aria-pressed", "true");
		fireEvent.click(toggle);
		expect(toggle).toHaveAttribute("aria-pressed", "false");
	});
});

describe("<StudioHeader> system menu", () => {
	it("hides the trigger when Theme/Locale are both off and no headerEnd is supplied", () => {
		render(
			<Setup
				config={{
					theme: { allowToggle: false },
					i18n: { showLocaleSwitch: false },
				}}
			>
				<StudioHeader />
			</Setup>,
		);
		expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
	});

	it("shows the trigger and reveals Theme + headerEnd on open", () => {
		render(
			<Setup config={{ theme: { allowToggle: true } }}>
				<StudioHeader headerEnd={<button type="button">Custom</button>} />
			</Setup>,
		);
		const trigger = screen.getByRole("button", { name: "Settings" });
		fireEvent.click(trigger);
		expect(screen.getByRole("button", { name: "Theme" })).not.toBeNull();
		expect(screen.getByRole("button", { name: "Custom" })).not.toBeNull();
	});

	it("still shows headerEnd unconditionally even when Theme/Locale are both off", () => {
		render(
			<Setup
				config={{
					theme: { allowToggle: false },
					i18n: { showLocaleSwitch: false },
				}}
			>
				<StudioHeader headerEnd={<button type="button">Custom</button>} />
			</Setup>,
		);
		const trigger = screen.getByRole("button", { name: "Settings" });
		fireEvent.click(trigger);
		expect(screen.getByRole("button", { name: "Custom" })).not.toBeNull();
		expect(screen.queryByRole("button", { name: "Theme" })).toBeNull();
	});
});
