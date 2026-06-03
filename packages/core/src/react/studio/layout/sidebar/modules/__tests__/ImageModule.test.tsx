/**
 * @file Tests for the `image` module body.
 *
 * Coverage matches the build plan §5.1 row for `ImageModule.test.tsx`:
 * pluginMissing branch, filter strip → store, search filter, click
 * dispatches Puck `setData` with the right component type, and the
 * overflow menu surfaces all four built-in actions.
 */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageModule } from "@/layout/sidebar/modules/ImageModule";
import {
	SidebarHeaderActionsProvider,
	useSidebarHeaderActions,
} from "@/layout/sidebar/SidebarHeaderActionsContext";
import {
	createSidebarRegistryStore,
	EditorI18nProvider,
	EditorUiStoreProvider,
	SidebarRegistryProvider,
	type SidebarRegistryStoreApi,
} from "@/state/index";
import type { StudioAssetSource } from "@/types/sidebar";

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
		<EditorI18nProvider>
			<EditorUiStoreProvider
				storeId={`image-${Math.random().toString(36).slice(2)}`}
			>
				<SidebarRegistryProvider value={store}>
					<SidebarHeaderActionsProvider>
						{children}
					</SidebarHeaderActionsProvider>
				</SidebarRegistryProvider>
			</EditorUiStoreProvider>
		</EditorI18nProvider>
	);
}

/**
 * Renders the header actions a module publishes via
 * `useSetSidebarHeaderActions` — the real sidebar shell does this, but the unit
 * harness must opt in to exercise the `ImageModule` header menu.
 */
function HeaderActionsOutlet(): ReactNode {
	return <>{useSidebarHeaderActions()}</>;
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

	it("renders the library-empty state when the source returns no assets", async () => {
		const registry = createSidebarRegistryStore();
		registry.getState().registerAssetSource(makeSource());
		render(
			<Setup registry={registry}>
				<ImageModule />
			</Setup>,
		);
		expect(await screen.findByTestId("ak-image-library-empty")).toBeTruthy();
	});

	it("prefers listPaginated and loads additional pages by cursor", async () => {
		const registry = createSidebarRegistryStore();
		const list = vi.fn().mockReturnValue([]);
		const listPaginated = vi
			.fn()
			.mockResolvedValueOnce({
				items: [
					{
						id: "png-1",
						kind: "image",
						name: "photo.png",
						url: "asset://png-1",
					},
				],
				total: 2,
				nextCursor: "cursor-2",
			})
			.mockResolvedValueOnce({
				items: [
					{
						id: "png-2",
						kind: "image",
						name: "second.png",
						url: "asset://png-2",
					},
				],
				total: 2,
				nextCursor: undefined,
			});
		registry
			.getState()
			.registerAssetSource(makeSource({ list, listPaginated }));

		render(
			<Setup registry={registry}>
				<ImageModule />
			</Setup>,
		);

		expect(await screen.findByLabelText("photo.png")).toBeTruthy();
		expect(list).not.toHaveBeenCalled();
		expect(listPaginated).toHaveBeenCalledWith({
			query: undefined,
			kinds: undefined,
			cursor: undefined,
			limit: 50,
		});

		fireEvent.click(screen.getByRole("button", { name: "Load more" }));

		expect(await screen.findByLabelText("second.png")).toBeTruthy();
		expect(listPaginated).toHaveBeenLastCalledWith({
			query: undefined,
			kinds: undefined,
			cursor: "cursor-2",
			limit: 50,
		});
	});

	it("renders an error state when asset listing rejects", async () => {
		const registry = createSidebarRegistryStore();
		registry
			.getState()
			.registerAssetSource(
				makeSource({ list: vi.fn().mockRejectedValue(new Error("offline")) }),
			);

		render(
			<Setup registry={registry}>
				<ImageModule />
			</Setup>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("ak-image-load-error")).toBeTruthy();
		});
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

	it("dispatches a Puck setData when an image tile is clicked, seeded with src and alt", async () => {
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

		const tile = await screen.findByLabelText("photo.png");
		fireEvent.click(tile);

		expect(dispatch).toHaveBeenCalledTimes(1);
		const action = dispatch.mock.calls[0]?.[0] as {
			readonly type: string;
			readonly data: {
				readonly content: ReadonlyArray<{
					readonly type: string;
					readonly props: Record<string, unknown>;
				}>;
			};
		};
		expect(action.type).toBe("setData");
		const inserted = action.data.content[0];
		expect(inserted?.type).toBe("Image");
		expect(inserted?.props["src"]).toBe("asset://png-1");
		expect(inserted?.props["alt"]).toBe("photo.png");
	});

	it("silently skips insertion when the matching component is not registered", async () => {
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

		fireEvent.click(await screen.findByLabelText("photo.png"));
		expect(dispatch).not.toHaveBeenCalled();
	});

	it("opens the overflow menu and renders all four built-in actions", async () => {
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

		fireEvent.click(await screen.findByTestId("ak-image-overflow-png-1"));
		const popup = screen.getByTestId("ak-image-overflow-popup-png-1");
		const labels = Array.from(popup.querySelectorAll("[role='menuitem']"))
			.map((el) => el.textContent?.trim())
			.filter(Boolean);
		expect(labels).toEqual(
			expect.arrayContaining(["Rename", "Replace", "Copy URL", "Delete"]),
		);
	});

	it("appends plugin-contributed asset actions below a separator", async () => {
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

		fireEvent.click(await screen.findByTestId("ak-image-overflow-png-1"));
		expect(screen.getByTestId("ak-image-action-open-cdn")).toBeTruthy();
	});

	it("renders folder navigation and scopes the query by folder", async () => {
		const registry = createSidebarRegistryStore();
		const listPaginated = vi.fn().mockResolvedValue({
			items: [{ id: "a1", kind: "image", name: "a1.png", url: "asset://a1" }],
			total: 1,
			nextCursor: undefined,
			folders: [
				{
					id: "f1",
					name: "Marketing",
					parentId: null,
					counts: { assets: 2, folders: 0 },
				},
			],
			folderPath: [],
		});
		const createFolder = vi
			.fn()
			.mockResolvedValue({ id: "f2", name: "New", parentId: null });
		registry.getState().registerAssetSource(
			makeSource({
				list: vi.fn().mockReturnValue([]),
				listPaginated,
				createFolder,
			}),
		);

		render(
			<Setup registry={registry}>
				<ImageModule />
			</Setup>,
		);

		// Folder nav renders for a folder-aware source; the initial query is
		// root-scoped (folderId null), and child folders are listed.
		expect(await screen.findByTestId("ak-image-folder-nav")).toBeTruthy();
		const marketing = await screen.findByRole("button", { name: /Marketing/ });
		expect(listPaginated).toHaveBeenCalledWith(
			expect.objectContaining({ folderId: null }),
		);

		// Navigating into a folder re-queries scoped to that folder.
		fireEvent.click(marketing);
		await waitFor(() => {
			expect(listPaginated).toHaveBeenCalledWith(
				expect.objectContaining({ folderId: "f1" }),
			);
		});
	});

	it("does not render folder nav for a flat (non-folder) source", async () => {
		const registry = createSidebarRegistryStore();
		registry.getState().registerAssetSource(
			makeSource({
				list: vi.fn().mockReturnValue([]),
				listPaginated: vi.fn().mockResolvedValue({
					items: [
						{ id: "a1", kind: "image", name: "a1.png", url: "asset://a1" },
					],
					total: 1,
					nextCursor: undefined,
				}),
			}),
		);
		render(
			<Setup registry={registry}>
				<ImageModule />
			</Setup>,
		);
		await screen.findByLabelText("a1.png");
		expect(screen.queryByTestId("ak-image-folder-nav")).toBeNull();
		expect(screen.queryByTestId("ak-image-source-tabs")).toBeNull();
	});

	it("shows source tabs + theme chips and picks external results on insert", async () => {
		const registry = createSidebarRegistryStore();
		const pickResult = vi.fn().mockResolvedValue({
			id: "unsplash:p1",
			kind: "image",
			name: "pic",
			url: "asset://unsplash:p1",
			source: "unsplash",
		});
		const listPaginated = vi.fn().mockResolvedValue({
			items: [
				{
					id: "unsplash:p1",
					kind: "image",
					name: "pic",
					url: "asset://unsplash:p1",
					source: "unsplash",
					thumbnailUrl: "https://images.unsplash.com/p1",
				},
			],
			total: 1,
			nextCursor: undefined,
		});
		registry.getState().registerAssetSource(
			makeSource({
				list: vi.fn().mockReturnValue([]),
				listPaginated,
				listThemes: () => [
					{ id: "nature", label: "assetManager.unsplash.theme.nature" },
				],
				pickResult,
			}),
		);

		render(
			<Setup registry={registry}>
				<ImageModule />
			</Setup>,
		);

		expect(await screen.findByTestId("ak-image-source-tabs")).toBeTruthy();
		// Switch to the Unsplash tab → theme chips appear.
		fireEvent.click(screen.getByText("Unsplash"));
		expect(await screen.findByTestId("ak-image-theme-chips")).toBeTruthy();

		// Clicking an external tile picks it (registers + fires the download trigger).
		fireEvent.click(await screen.findByLabelText("pic"));
		await waitFor(() => {
			expect(pickResult).toHaveBeenCalled();
		});
	});

	it("does not leak folderId to the Unsplash tab when the source is folder-aware", async () => {
		// Regression: a composite source with folders + Unsplash is BOTH
		// folder-aware (createFolder defined) AND themed (Unsplash tab). Sending
		// folderId:null on the Unsplash tab makes providerCanSatisfy drop the
		// folders:false provider → the picker grid is permanently empty. The
		// Library tab must still folder-scope; the Unsplash tab must not.
		const registry = createSidebarRegistryStore();
		const listPaginated = vi.fn().mockResolvedValue({
			items: [],
			total: 0,
			nextCursor: undefined,
			folders: [],
			folderPath: [],
		});
		registry.getState().registerAssetSource(
			makeSource({
				list: vi.fn().mockReturnValue([]),
				listPaginated,
				createFolder: vi
					.fn()
					.mockResolvedValue({ id: "f1", name: "New", parentId: null }),
				listThemes: () => [
					{ id: "nature", label: "assetManager.unsplash.theme.nature" },
				],
			}),
		);

		render(
			<Setup registry={registry}>
				<ImageModule />
			</Setup>,
		);

		// Library tab (default): folder-aware ⇒ query carries folderId:null.
		await waitFor(() => {
			expect(listPaginated.mock.calls.some(([q]) => q.folderId === null)).toBe(
				true,
			);
		});

		// Switch to the Unsplash tab.
		fireEvent.click(await screen.findByText("Unsplash"));

		// The Unsplash query must scope to the unsplash source and must NOT
		// carry folderId (any value, including null).
		await waitFor(() => {
			const unsplashCall = listPaginated.mock.calls
				.map(([q]) => q)
				.find(
					(q) => Array.isArray(q.sources) && q.sources.includes("unsplash"),
				);
			expect(unsplashCall).toBeTruthy();
			expect(unsplashCall).not.toHaveProperty("folderId");
		});
	});

	it("hides the folder nav + media-kind filter on the Unsplash tab, leaving theme chips + search", async () => {
		// Local-library chrome (folder breadcrumb + All/Images/Videos/Audio
		// filter) must not appear on an external browse source — Unsplash has no
		// folders and is image-only. Only the theme chips + search remain. The
		// source is BOTH folder-aware (createFolder) and themed (listThemes), so
		// the gate is the active tab, not the source's capabilities.
		const registry = createSidebarRegistryStore();
		const listPaginated = vi.fn().mockResolvedValue({
			items: [],
			total: 0,
			nextCursor: undefined,
			folders: [],
			folderPath: [],
		});
		registry.getState().registerAssetSource(
			makeSource({
				list: vi.fn().mockReturnValue([]),
				listPaginated,
				createFolder: vi
					.fn()
					.mockResolvedValue({ id: "f1", name: "New", parentId: null }),
				listThemes: () => [
					{ id: "nature", label: "assetManager.unsplash.theme.nature" },
				],
			}),
		);

		render(
			<Setup registry={registry}>
				<ImageModule />
			</Setup>,
		);

		// Library tab (default): folder-aware ⇒ folder nav + filter strip render.
		expect(await screen.findByTestId("ak-image-folder-nav")).toBeTruthy();
		expect(screen.getByTestId("ak-image-filter")).toBeTruthy();

		// Switch to Unsplash ⇒ the local-library controls disappear and the
		// theme chips appear; only chips + search remain.
		fireEvent.click(await screen.findByText("Unsplash"));
		expect(await screen.findByTestId("ak-image-theme-chips")).toBeTruthy();
		await waitFor(() => {
			expect(screen.queryByTestId("ak-image-folder-nav")).toBeNull();
		});
		expect(screen.queryByTestId("ak-image-filter")).toBeNull();
		expect(screen.getByTestId("ak-image-search")).toBeTruthy();
	});

	it("merges upload + new folder behind a single header menu button", async () => {
		// One icon button publishes to the header; the old standalone upload
		// button no longer exists. The menu offers Upload + (folder-aware local
		// source) New folder, and New folder opens the inline name input.
		const registry = createSidebarRegistryStore();
		const createFolder = vi
			.fn()
			.mockResolvedValue({ id: "f9", name: "Brand", parentId: null });
		registry.getState().registerAssetSource(
			makeSource({
				list: vi.fn().mockReturnValue([]),
				listPaginated: vi.fn().mockResolvedValue({
					items: [],
					total: 0,
					nextCursor: undefined,
					folders: [],
					folderPath: [],
				}),
				createFolder,
			}),
		);

		render(
			<Setup registry={registry}>
				<HeaderActionsOutlet />
				<ImageModule />
			</Setup>,
		);

		const trigger = await screen.findByTestId("ak-image-actions");
		expect(screen.queryByTestId("ak-image-upload")).toBeNull();

		// Opening the merged button surfaces both create-affordances.
		fireEvent.click(trigger);
		expect(await screen.findByTestId("ak-image-action-upload")).toBeTruthy();
		fireEvent.click(await screen.findByTestId("ak-image-action-new-folder"));

		// New folder opens the inline name input; submitting creates the folder
		// at the current (root) location.
		const input = await screen.findByTestId("ak-image-new-folder-input");
		fireEvent.change(input, { target: { value: "Brand" } });
		fireEvent.keyDown(input, { key: "Enter" });
		await waitFor(() => {
			expect(createFolder).toHaveBeenCalledWith(null, "Brand");
		});
	});

	it("omits New folder from the header menu for a flat (non-folder) source", async () => {
		const registry = createSidebarRegistryStore();
		registry.getState().registerAssetSource(
			makeSource({
				list: vi.fn().mockReturnValue([]),
				listPaginated: vi.fn().mockResolvedValue({
					items: [],
					total: 0,
					nextCursor: undefined,
				}),
			}),
		);

		render(
			<Setup registry={registry}>
				<HeaderActionsOutlet />
				<ImageModule />
			</Setup>,
		);

		fireEvent.click(await screen.findByTestId("ak-image-actions"));
		expect(await screen.findByTestId("ak-image-action-upload")).toBeTruthy();
		expect(screen.queryByTestId("ak-image-action-new-folder")).toBeNull();
	});

	it("still shows Unsplash images when a videos/audio filter is persisted", async () => {
		// Regression: the media-kind filter is hidden on Unsplash, so a persisted
		// `videos`/`audio` selection (made on Library) must NOT silently partition
		// the image-only Unsplash results out of the grid — there'd be no visible
		// control to recover. The external grid ignores the local kind filter.
		const registry = createSidebarRegistryStore();
		registry.getState().registerAssetSource(
			makeSource({
				list: vi.fn().mockReturnValue([]),
				listPaginated: vi.fn().mockResolvedValue({
					items: [
						{
							id: "unsplash:p1",
							kind: "image",
							name: "pic",
							url: "https://images.unsplash.com/p1",
							source: "unsplash",
							thumbnailUrl: "https://images.unsplash.com/p1",
						},
					],
					total: 1,
					nextCursor: undefined,
				}),
				listThemes: () => [
					{ id: "nature", label: "assetManager.unsplash.theme.nature" },
				],
			}),
		);

		render(
			<Setup registry={registry}>
				<ImageModule />
			</Setup>,
		);

		// On Library, select the Videos kind filter (persists to the store).
		await screen.findByTestId("ak-image-source-tabs");
		const filterButtons = screen
			.getByTestId("ak-image-filter")
			.querySelectorAll("button");
		fireEvent.click(filterButtons[2]!); // [all, images, videos, audio]

		// Switch to Unsplash → the image result still renders despite filter=videos.
		fireEvent.click(screen.getByText("Unsplash"));
		expect(await screen.findByLabelText("pic")).toBeTruthy();
	});
});
