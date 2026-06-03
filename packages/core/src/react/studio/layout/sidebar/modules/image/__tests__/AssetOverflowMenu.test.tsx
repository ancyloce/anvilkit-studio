/**
 * @file Regression test for review finding P3: the asset overflow
 * menu must render Rename / Replace / Delete only when the
 * `StudioAssetSource` actually implements them (the methods are
 * optional). Copy URL is always available.
 */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetOverflowMenu } from "@/layout/sidebar/modules/image/AssetOverflowMenu";
import { EditorI18nProvider } from "@/state/index";
import type { StudioAsset, StudioAssetSource } from "@/types/sidebar";

afterEach(cleanup);

const ASSET: StudioAsset = {
	id: "a1",
	name: "photo.png",
	url: "https://example.com/photo.png",
	kind: "image",
};

function renderMenu(source: Partial<StudioAssetSource>) {
	render(
		<EditorI18nProvider>
			<AssetOverflowMenu
				asset={ASSET}
				source={source as StudioAssetSource}
				pluginActions={[]}
				onRename={vi.fn()}
				onReplace={vi.fn()}
			/>
		</EditorI18nProvider>,
	);
}

async function openMenu(): Promise<void> {
	fireEvent.click(screen.getByTestId(`ak-image-overflow-${ASSET.id}`));
	await waitFor(() => expect(screen.getByText("Copy URL")).toBeInTheDocument());
}

describe("AssetOverflowMenu — optional mutation actions", () => {
	it("renders all built-ins when the source implements them", async () => {
		renderMenu({
			rename: vi.fn(),
			replace: vi.fn(),
			delete: vi.fn(),
		});
		await openMenu();
		expect(screen.getByText("Rename")).toBeInTheDocument();
		expect(screen.getByText("Replace")).toBeInTheDocument();
		expect(screen.getByText("Delete")).toBeInTheDocument();
		expect(screen.getByText("Copy URL")).toBeInTheDocument();
	});

	it("renders only Delete (plus Copy URL) when the source only implements delete", async () => {
		renderMenu({ delete: vi.fn() });
		await openMenu();
		expect(screen.queryByText("Rename")).toBeNull();
		expect(screen.queryByText("Replace")).toBeNull();
		expect(screen.getByText("Delete")).toBeInTheDocument();
		expect(screen.getByText("Copy URL")).toBeInTheDocument();
	});

	it("renders no mutation actions when the source implements none", async () => {
		renderMenu({});
		await openMenu();
		expect(screen.queryByText("Rename")).toBeNull();
		expect(screen.queryByText("Replace")).toBeNull();
		expect(screen.queryByText("Delete")).toBeNull();
		expect(screen.getByText("Copy URL")).toBeInTheDocument();
	});
});
