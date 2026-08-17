import type { ChangeEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createAssetManagerTestHarness: vi.fn(),
	uploadAsset: vi.fn(),
}));

vi.mock("react", () => ({
	useRef: (current: unknown) => ({ current }),
	useState: (initial: unknown) => [initial, vi.fn()],
}));

vi.mock("@/lib/asset-manager-test-harness", () => ({
	createAssetManagerHtmlIr: vi.fn(),
	createAssetManagerReactIr: vi.fn(),
	createAssetManagerTestHarness: mocks.createAssetManagerTestHarness,
	formatWarnings: vi.fn(),
}));

vi.mock("@/lib/lazy-plugins", () => ({
	loadAssetManager: vi.fn(async () => ({
		getAssetRegistry: vi.fn(),
		uploadAsset: mocks.uploadAsset,
	})),
}));

import { useAssetManagerE2E } from "../use-asset-manager-e2e";

describe("useAssetManagerE2E", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createAssetManagerTestHarness.mockResolvedValue({
			asset: null,
			ctx: {},
			runtime: { exportFormats: new Map(), assetResolvers: new Map() },
		});
		mocks.uploadAsset.mockResolvedValue({ id: "asset-safe" });
	});

	it("clears the captured file input after the React event loses currentTarget", async () => {
		const input = {
			files: [{ name: "pixel.png", size: 1, type: "image/png" }],
			value: "C:\\fakepath\\pixel.png",
		};
		let currentTargetReads = 0;
		const event = {
			get currentTarget() {
				currentTargetReads += 1;
				return currentTargetReads === 1 ? input : null;
			},
		} as unknown as ChangeEvent<HTMLInputElement>;

		const { handleAssetManagerFileChange } = useAssetManagerE2E();

		await expect(handleAssetManagerFileChange(event)).resolves.toBeUndefined();
		expect(input.value).toBe("");
		expect(currentTargetReads).toBe(1);
	});
});
