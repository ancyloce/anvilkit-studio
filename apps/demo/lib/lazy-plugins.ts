/**
 * @file Example: wrap workspace plugins with `lazyPlugin` so each
 * plugin lands in its own bundler chunk and is only fetched when the
 * host page actually mounts `<Studio plugins={[…]}/>` with that
 * plugin in the array.
 *
 * The plugin's `meta` is provided synchronously to `lazyPlugin` so the
 * runtime can validate `coreVersion`, dedupe ids, and fingerprint the
 * plugins array without paying the dynamic-import cost. The plugin
 * module itself is awaited at `register()` time.
 *
 * Enable/disable is then purely a host concern — include the lazy
 * plugin in the `plugins` array when it's enabled, omit it when not.
 * The sidebar rail will pick up its registered slot via the existing
 * registry subscription in `SidebarRail.tsx`.
 */

import type { StudioPlugin } from "@anvilkit/core";
import { lazyPlugin } from "@anvilkit/core";
import { Frame, History, Images } from "lucide-react";
import { createElement } from "react";

// Demo host image for the Canvas Studio overlay's `image` tool. A 1×1
// transparent PNG seeded into every opened design so a placed image resolves
// to renderable bytes (the standalone /studio/canvas route uses the same id).
const HOST_IMAGE_ASSET_ID = "demo-host-image";
const HOST_IMAGE_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/**
 * Lazy-loaded asset-manager plugin. The
 * `@anvilkit/plugin-asset-manager` chunk is only fetched when this
 * plugin is included in `<Studio plugins={[...]} />`.
 *
 * The host can pass any uploader by augmenting the factory call inside
 * the loader; this demo uses the default in-memory uploader for
 * simplicity.
 */
export const lazyAssetManagerPlugin: StudioPlugin = lazyPlugin(
	async () => {
		const mod = await import("@anvilkit/plugin-asset-manager");
		return mod.createAssetManagerPlugin({
			uploader: mod.inMemoryUploader(),
		});
	},
	{
		id: "@anvilkit/plugin-asset-manager",
		name: "Asset Manager",
		version: "0.1.0",
		coreVersion: "^0.1.0",
		description: "Sidebar asset library + uploader",
		capabilities: { header: true },
		icon: createElement(Images),
	},
);

/**
 * Lazy-loaded version-history plugin. Chunk only fetched when
 * included in the `plugins` array.
 */
export const lazyVersionHistoryPlugin: StudioPlugin = lazyPlugin(
	async () => {
		const mod = await import("@anvilkit/plugin-version-history");
		return mod.createVersionHistoryPlugin({
			adapter: mod.inMemoryAdapter(),
		});
	},
	{
		id: "@anvilkit/plugin-version-history",
		name: "Version History",
		version: "0.1.0",
		coreVersion: "^0.1.0",
		description: "Sidebar history panel + snapshot adapter",
		capabilities: { header: true },
		icon: createElement(History),
	},
);

/**
 * Lazy-loaded Canvas Studio plugin. This is the heaviest plugin in the
 * demo — its `register()` pulls `@anvilkit/canvas-editor`, which in turn
 * pulls Konva + react-konva — so deferring it keeps that whole graph out
 * of the editor page's initial chunk until `<Studio>` actually mounts.
 *
 * The loader runs client-side at `register()` time, so `localStorage` is
 * available and the persistence adapter is created here (keeping the
 * adapter import deferred too). The SSR-noop fallback mirrors the
 * convention used by the standalone canvas route's `CanvasStudioClient`.
 */
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
				: mod.localStorageCanvasAdapter({ namespace: "demo-canvas" });
		return mod.createCanvasStudioPlugin({
			adapter,
			// Demo image picker: the editor's `image` tool resolves this to an
			// asset id and places a node referencing it. We return a fixed host
			// image and seed it into every opened design (mirrors the standalone
			// /studio/canvas route) so placing an image needs no picker UI and
			// always resolves to renderable bytes.
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
		version: "0.1.1",
		coreVersion: "^0.1.0-alpha",
		description:
			"Mounts the Canvas Studio overlay, registers the design-block quick-add, and exposes the design:// asset resolver.",
		capabilities: { header: true },
		icon: createElement(Frame),
	},
);
