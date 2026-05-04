/**
 * @file Tests for the `EditorDrawer` Puck `drawer` override.
 *
 * Phase C made the override a thin passthrough that delegates to
 * {@link InsertDrawerBody}; these tests verify the override still
 * receives Puck's children and that the body wires through to the
 * sidebar registry.
 */

import type { Config as PuckConfig } from "@puckeditor/core";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	createSidebarRegistryStore,
	EditorI18nStoreProvider,
	EditorUiStoreProvider,
	SidebarRegistryProvider,
} from "../../../studio/state/index.js";
import { DEFAULT_INSERT_SECTIONS } from "../../../studio/layout/sidebar/modules/insert/default-sections.js";
import { EditorDrawer } from "../EditorDrawer.js";

const FAKE_CONFIG: PuckConfig = {
	categories: { navigation: { components: ["Navbar"] } },
	components: {},
} as unknown as PuckConfig;

vi.mock("@puckeditor/core", async () => {
	const actual = (await vi.importActual<Record<string, unknown>>(
		"@puckeditor/core",
	)) as Record<string, unknown>;
	return {
		...actual,
		useGetPuck: () => () => ({ config: FAKE_CONFIG }),
	};
});

afterEach(cleanup);

function Setup({ children }: { readonly children: ReactElement }): ReactElement {
	const registry = createSidebarRegistryStore();
	for (const section of DEFAULT_INSERT_SECTIONS) {
		registry.getState().registerInsertSection(section);
	}
	return (
		<EditorI18nStoreProvider>
			<EditorUiStoreProvider
				storeId={`drawer-${Math.random().toString(36).slice(2)}`}
			>
				<SidebarRegistryProvider value={registry}>
					{children}
				</SidebarRegistryProvider>
			</EditorUiStoreProvider>
		</EditorI18nStoreProvider>
	);
}

describe("EditorDrawer", () => {
	it("delegates to InsertDrawerBody and groups the supplied children into sections", () => {
		render(
			<Setup>
				<EditorDrawer>
					<button type="button" name="Navbar" data-testid="navbar-item">
						Navbar
					</button>
				</EditorDrawer>
			</Setup>,
		);
		const navigation = screen.getByTestId("ak-insert-section-navigation");
		expect(
			navigation.querySelector('[data-testid="navbar-item"]'),
		).toBeTruthy();
	});

	it("shows the library-empty state when Puck supplies no Drawer.Items", () => {
		render(
			<Setup>
				<EditorDrawer>{null}</EditorDrawer>
			</Setup>,
		);
		expect(screen.getByTestId("ak-insert-empty-library")).toBeTruthy();
	});
});
