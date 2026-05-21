/**
 * @file Tests for the `copilot` module body.
 *
 * Two contracts:
 *   1. With no registered copilot panel the module renders the
 *      `studio.module.copilot.empty` empty state.
 *   2. With a registered panel the module renders the panel's
 *      `render()` output inside the module body.
 */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { CopilotModule } from "@/layout/sidebar/modules/CopilotModule";
import {
	createSidebarRegistryStore,
	EditorI18nStoreProvider,
	EditorUiStoreProvider,
	SidebarRegistryProvider,
	type SidebarRegistryStoreApi,
} from "@/state/index";

afterEach(() => {
	cleanup();
});

function Setup({
	children,
	registry,
}: {
	readonly children: ReactNode;
	readonly registry?: SidebarRegistryStoreApi;
}): ReactElement {
	const store = registry ?? createSidebarRegistryStore();
	return (
		<EditorI18nStoreProvider>
			<EditorUiStoreProvider
				storeId={`copilot-${Math.random().toString(36).slice(2)}`}
			>
				<SidebarRegistryProvider value={store}>
					{children}
				</SidebarRegistryProvider>
			</EditorUiStoreProvider>
		</EditorI18nStoreProvider>
	);
}

describe("CopilotModule", () => {
	it("renders the empty state when no copilot panel is registered", () => {
		render(
			<Setup>
				<CopilotModule />
			</Setup>,
		);
		expect(screen.getByTestId("ak-copilot-empty")).toBeTruthy();
	});

	it("renders the registered panel body", () => {
		const registry = createSidebarRegistryStore();
		registry.getState().registerCopilotPanel({
			render: () => (
				<div data-testid="ak-copilot-panel-fixture">copilot fixture</div>
			),
		});

		render(
			<Setup registry={registry}>
				<CopilotModule />
			</Setup>,
		);

		expect(screen.getByTestId("ak-copilot-panel-fixture")).toBeTruthy();
		expect(screen.queryByTestId("ak-copilot-empty")).toBeNull();
	});
});
