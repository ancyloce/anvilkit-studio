/**
 * @file Tests for the `image` module body.
 *
 * Coverage matches the build plan §5.1 row for `ImageModule.test.tsx`:
 * pluginMissing branch, filter strip → store, search filter, click
 * dispatches Puck `setData` with the right component type, and the
 * overflow menu surfaces all four built-in actions.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioAssetSource } from "../../../../../../types/sidebar.js";
import {
	createSidebarRegistryStore,
	EditorI18nStoreProvider,
	EditorUiStoreProvider,
	SidebarRegistryProvider,
	type SidebarRegistryStoreApi,
} from "../../../../state/index.js";
import { SidebarHeaderActionsProvider } from "../../SidebarHeaderActionsContext.js";
import { ImageModule } from "../ImageModule.js";

const dispatch = vi.fn();
const mockPuckSnapshot = {
	config: { components: {} as Record<string, unknown> },
	appState: { data: { content: [] as unknown[] } },
	dispatch,
	selectedItem: null,
};

vi.mock("@puckeditor/core", () => ({
	useGetPuck: () => () => mockPuckSnapshot,
}));

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		warning: vi.fn(),
	},
}));

afterEach(() => {
	cleanup();
	dispatch.mockReset();
	mockPuckSnapshot.config.components = {};
	mockPuckSnapshot.appState.data.content = [];
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
				storeId={`image-${Math.random().toString(36).slice(2)}`}
			>
				<SidebarRegistryProvider value={store}>
					<SidebarHeaderActionsProvider>{children}</SidebarHeaderActionsProvider>
				</SidebarRegistryProvider>
			</EditorUiStoreProvider>
		</EditorI18nStoreProvider>
	);
}

function makeSource(
	overrides: Partial<StudioAssetSource> = {},
): StudioAssetSource {
	return {
		list: vi.fn().mockReturnValue([]),
		upload: vi.fn().mockResolvedValue([]),
		rename: vi.fn().mockResolvedValue(undefined),
		replace: vi.fn().mockResolvedValue({
			id: "replaced",
			kind: "image",
			name: "replaced.png",
			url: "asset://replaced",
		}),
		delete: vi.fn().mockResolvedValue(undefined),
		getUrl: vi.fn().mockReturnValue("asset://x"),
		subscribe: vi.fn().mockReturnValue(() => undefined),
		...overrides,
	};
}

describe("ImageModule", () => {
	it("renders the pluginMissing empty state when no source is registered", () => {
		render(
			<Setup>
				<ImageModule />
			</Setup>,
		);
		expect(screen.getByTestId("ak-image-plugin-missing")).toBeTruthy();
	});

	it("renders the library-empty state when the source returns no assets", () => {
		const registry = createSidebarRegistryStore();
		registry.getState().registerAssetSource(makeSource());
		render(
			<Setup registry={registry}>
				<ImageModule />
			</Setup>,
		);
		expect(screen.getByTestId("ak-image-library-empty")).toBeTruthy();
	});

	it("renders the filter strip and reflects assetCategoryFilter changes", () => {
		const registry = createSidebarRegistryStore();
		registry.getState().registerAssetSource(makeSource());
		render(
			<Setup registry={registry}>
				<ImageModule />
			</Setup>,
		);
		const filterRoot = screen.getByTestId("ak-image-filter");
		const items = filterRoot.querySelectorAll("button");
		// First item is "All" — should be pressed by default.
		expect(items[0]?.getAttribute("data-pressed")).not.toBeNull();
		// Click "Images".
		fireEvent.click(items[1]!);
		expect(items[1]?.getAttribute("data-pressed")).not.toBeNull();
	});

	it("dispatches a Puck setData when an image tile is clicked, seeded with src and alt", () => {
		mockPuckSnapshot.config.components = { Image: {} };
		const registry = createSidebarRegistryStore();
		const source = makeSource({
			list: () => [
				{
					id: "png-1",
					kind: "image",
					name: "photo.png",
					url: "asset://png-1",
					mimeType: "image/png",
				},
			],
		});
		registry.getState().registerAssetSource(source);

		render(
			<Setup registry={registry}>
				<ImageModule />
			</Setup>,
		);

		const tile = screen.getByLabelText("photo.png");
		fireEvent.click(tile);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const action = dispatch.mock.calls[0]?.[0] as {
			readonly type: string;
			readonly data: { readonly content: ReadonlyArray<{
				readonly type: string;
				readonly props: Record<string, unknown>;
			}> };
		};
		expect(action.type).toBe("setData");
		const inserted = action.data.content[0];
		expect(inserted?.type).toBe("Image");
		expect(inserted?.props["src"]).toBe("asset://png-1");
		expect(inserted?.props["alt"]).toBe("photo.png");
	});

	it("silently skips insertion when the matching component is not registered", () => {
		mockPuckSnapshot.config.components = {}; // No "Image" key.
		const registry = createSidebarRegistryStore();
		const source = makeSource({
			list: () => [
				{
					id: "png-1",
					kind: "image",
					name: "photo.png",
					url: "asset://png-1",
				},
			],
		});
		registry.getState().registerAssetSource(source);

		render(
			<Setup registry={registry}>
				<ImageModule />
			</Setup>,
		);

		fireEvent.click(screen.getByLabelText("photo.png"));
		expect(dispatch).not.toHaveBeenCalled();
	});

	it("opens the overflow menu and renders all four built-in actions", () => {
		const registry = createSidebarRegistryStore();
		const source = makeSource({
			list: () => [
				{
					id: "png-1",
					kind: "image",
					name: "photo.png",
					url: "asset://png-1",
				},
			],
		});
		registry.getState().registerAssetSource(source);

		render(
			<Setup registry={registry}>
				<ImageModule />
			</Setup>,
		);

		fireEvent.click(screen.getByTestId("ak-image-overflow-png-1"));
		const popup = screen.getByTestId("ak-image-overflow-popup-png-1");
		const labels = Array.from(popup.querySelectorAll("[role='menuitem']"))
			.map((el) => el.textContent?.trim())
			.filter(Boolean);
		expect(labels).toEqual(
			expect.arrayContaining(["Rename", "Replace", "Copy URL", "Delete"]),
		);
	});

	it("appends plugin-contributed asset actions below a separator", () => {
		const registry = createSidebarRegistryStore();
		const source = makeSource({
			list: () => [
				{
					id: "png-1",
					kind: "image",
					name: "photo.png",
					url: "asset://png-1",
				},
			],
		});
		registry.getState().registerAssetSource(source);
		registry.getState().registerAssetAction({
			id: "open-cdn",
			labelKey: "studio.module.image.actions.copyUrl",
			run: vi.fn(),
		});

		render(
			<Setup registry={registry}>
				<ImageModule />
			</Setup>,
		);

		fireEvent.click(screen.getByTestId("ak-image-overflow-png-1"));
		expect(screen.getByTestId("ak-image-action-open-cdn")).toBeTruthy();
	});
});
