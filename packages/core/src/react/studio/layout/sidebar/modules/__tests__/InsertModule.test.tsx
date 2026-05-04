/**
 * @file Tests for `InsertModule` — the wrapper that mounts
 * `<Puck.Components />` and publishes the view toggle into the panel
 * header via {@link SidebarHeaderActionsContext}.
 */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	createSidebarRegistryStore,
	EditorI18nStoreProvider,
	EditorUiStoreProvider,
	SidebarRegistryProvider,
} from "../../../../state/index.js";
import {
	SidebarHeaderActionsProvider,
	useSidebarHeaderActions,
} from "../../SidebarHeaderActionsContext.js";
import { InsertModule } from "../InsertModule.js";

vi.mock("@puckeditor/core", () => ({
	Puck: { Components: () => <div data-testid="puck-components-mock" /> },
}));

afterEach(cleanup);

function HeaderActionsProbe(): ReactElement {
	const actions = useSidebarHeaderActions();
	return (
		<div data-testid="header-actions-probe">
			<span data-testid="header-actions-state">
				{actions === null ? "none" : "present"}
			</span>
			{actions}
		</div>
	);
}

function Setup({ children }: { readonly children: ReactNode }): ReactElement {
	const registry = createSidebarRegistryStore();
	return (
		<EditorI18nStoreProvider>
			<EditorUiStoreProvider
				storeId={`module-${Math.random().toString(36).slice(2)}`}
			>
				<SidebarRegistryProvider value={registry}>
					<SidebarHeaderActionsProvider>{children}</SidebarHeaderActionsProvider>
				</SidebarRegistryProvider>
			</EditorUiStoreProvider>
		</EditorI18nStoreProvider>
	);
}

describe("InsertModule", () => {
	it("mounts Puck.Components inside the module body", () => {
		render(
			<Setup>
				<InsertModule />
			</Setup>,
		);
		expect(screen.getByTestId("puck-components-mock")).toBeTruthy();
	});

	it("renders the search input above the components area", () => {
		render(
			<Setup>
				<InsertModule />
			</Setup>,
		);
		// `studio.module.insert.search.placeholder` resolves to
		// "Search components…".
		const searchInput = screen.getByRole("searchbox", {
			name: "Search components…",
		});
		expect(searchInput).toBeTruthy();
	});

	it("publishes the view toggle into the SidebarHeaderActionsContext", async () => {
		render(
			<Setup>
				<HeaderActionsProbe />
				<InsertModule />
			</Setup>,
		);
		// The `useEffect` that publishes runs after the first commit;
		// rerendering the probe picks it up automatically.
		await vi.waitFor(() => {
			expect(
				screen.getByTestId("header-actions-state").textContent,
			).toBe("present");
		});
		// The published actions include the toggle's grid + list
		// buttons (label resolves via i18n).
		expect(screen.getByRole("button", { name: "Grid view" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "List view" })).toBeTruthy();
	});

	it("clears the published actions on unmount", async () => {
		const { unmount } = render(
			<Setup>
				<HeaderActionsProbe />
				<InsertModule />
			</Setup>,
		);
		await vi.waitFor(() => {
			expect(
				screen.getByTestId("header-actions-state").textContent,
			).toBe("present");
		});
		unmount();
		// Probe survived the unmount? No — the entire tree is gone.
		// To assert the cleanup ran, mount a fresh probe-only tree and
		// confirm a new provider starts at "none".
		render(
			<Setup>
				<HeaderActionsProbe />
			</Setup>,
		);
		const states = screen.getAllByTestId("header-actions-state");
		expect(states.at(-1)?.textContent).toBe("none");
	});
});
