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

import { lazyPlugin } from "@anvilkit/core";
import type { StudioPlugin } from "@anvilkit/core";
import { Frame, History, Images } from "lucide-react";
import { createElement } from "react";

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
		return mod.createCanvasStudioPlugin({ adapter });
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
