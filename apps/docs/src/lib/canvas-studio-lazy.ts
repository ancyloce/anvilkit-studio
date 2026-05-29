/**
 * Lazy-loaded Canvas Studio plugin for the docs playground.
 *
 * Ported from `apps/demo/lib/lazy-plugins.ts`. Canvas Studio is the
 * heaviest plugin — its `register()` pulls `@anvilkit/canvas-editor`,
 * which pulls Konva + react-konva — so we wrap it in `lazyPlugin()` to
 * keep that graph out of the playground island's entry chunk until
 * `<Studio>` actually mounts with this plugin in the array. The host
 * still imports `@anvilkit/canvas-editor/styles.css` so the overlay
 * chrome renders.
 *
 * The loader runs client-side at `register()` time, so `localStorage`
 * exists and the persistence adapter is constructed there (SSR-noop
 * fallback mirrors the demo).
 */

import type { StudioPlugin } from "@anvilkit/core";
import { lazyPlugin } from "@anvilkit/core";

// 1×1 transparent PNG seeded into every opened design so the image
// tool resolves to renderable bytes without a picker UI.
const HOST_IMAGE_ASSET_ID = "playground-host-image";
const HOST_IMAGE_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export const lazyCanvasStudioPlugin: StudioPlugin = lazyPlugin(
	async () => {
		const mod = await import("@anvilkit/plugin-canvas-studio");
		const adapter =
			typeof globalThis.localStorage === "undefined"
				? {
						save: () => undefined,
						load: () => null,
						list: () => [],
						delete: () => undefined,
					}
				: mod.localStorageCanvasAdapter({ namespace: "playground-canvas" });
		return mod.createCanvasStudioPlugin({
			adapter,
			onPickAsset: async () => HOST_IMAGE_ASSET_ID,
			seedAssets: {
				[HOST_IMAGE_ASSET_ID]: {
					id: HOST_IMAGE_ASSET_ID,
					uri: HOST_IMAGE_DATA_URL,
				},
			},
		});
	},
	{
		id: "@anvilkit/plugin-canvas-studio",
		name: "Canvas Studio",
		version: "0.1.3",
		coreVersion: "^0.1.0-alpha",
		description:
			"Mounts the Canvas Studio overlay, registers the design-block quick-add, and exposes the design:// asset resolver.",
		capabilities: { header: true },
	},
);
