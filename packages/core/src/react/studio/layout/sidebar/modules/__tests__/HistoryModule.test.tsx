/**
 * @file Tests for the `history` module body.
 *
 * Two contracts (mirrors `CopilotModule.test.tsx`):
 *   1. With no registered history panel the module renders the
 *      `studio.module.history.empty` empty state.
 *   2. With a registered panel the module renders the panel's
 *      `render()` output inside the module body.
 */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { HistoryModule } from "@/layout/sidebar/modules/HistoryModule";
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
				storeId={`history-${Math.random().toString(36).slice(2)}`}
			>
				<SidebarRegistryProvider value={store}>
					{children}
				</SidebarRegistryProvider>
			</EditorUiStoreProvider>
		</EditorI18nStoreProvider>
	);
}

describe("HistoryModule", () => {
	it("renders the empty state when no history panel is registered", () => {
		render(
			<Setup>
				<HistoryModule />
			</Setup>,
		);
		expect(screen.getByTestId("ak-history-empty")).toBeTruthy();
	});

	it("renders the registered panel body", () => {
		const registry = createSidebarRegistryStore();
		registry.getState().registerHistoryPanel({
			render: () => (
				<div data-testid="ak-history-panel-fixture">history fixture</div>
			),
		});

		render(
			<Setup registry={registry}>
				<HistoryModule />
			</Setup>,
		);

		expect(screen.getByTestId("ak-history-panel-fixture")).toBeTruthy();
		expect(screen.queryByTestId("ak-history-empty")).toBeNull();
	});
});
