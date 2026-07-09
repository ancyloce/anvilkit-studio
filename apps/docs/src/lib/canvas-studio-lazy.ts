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
import {
	lazyPlugin,
	lazyPluginWith,
	withoutHeaderActions,
} from "@anvilkit/core";
import type { Config } from "@puckeditor/core";

// Note: unlike the demo, `apps/docs` does not depend on `lucide-react`,
// so these lazy wrappers omit the optional `meta.icon` — the host tooling
// that renders plugin icons is not used in the playground.

/**
 * Collapse repeated `import()` of a plugin package to a single resolved
 * value so a lazy entry's `register()` and any host handler share one
 * fetched chunk and one module instance.
 */
function memoLoader<T>(load: () => Promise<T>): () => Promise<T> {
	let promise: Promise<T> | undefined;
	return () => {
		promise ??= load();
		return promise;
	};
}

/** Deferred plugin-package modules (shared with the playground handlers). */
export const loadExportHtml = memoLoader(
	() => import("@anvilkit/plugin-export-html"),
);
export const loadExportReact = memoLoader(
	() => import("@anvilkit/plugin-export-react"),
);
export const loadAssetManager = memoLoader(
	() => import("@anvilkit/plugin-asset-manager"),
);

/** Lazy HTML-export plugin (publish-panel format, no first-paint pixel). */
export const lazyHtmlExportPlugin: StudioPlugin = lazyPlugin(
	async () => {
		const mod = await loadExportHtml();
		return mod.createHtmlExportPlugin({ headerAction: false });
	},
	{
		id: "anvilkit-plugin-export-html",
		name: "HTML Export",
		version: "0.1.4",
		coreVersion: "^0.1.0-alpha",
		description: "Export Puck pages as standalone HTML documents.",
		capabilities: { header: true },
	},
);

/** Lazy React-export plugin (publish-panel format, no first-paint pixel). */
export const lazyReactExportPlugin: StudioPlugin = lazyPlugin(
	async () => {
		const mod = await loadExportReact();
		return mod.createReactExportPlugin({
			syntax: "tsx",
			assetStrategy: "url-prop",
		});
	},
	{
		id: "anvilkit-plugin-export-react",
		name: "React Export",
		version: "0.1.4",
		coreVersion: "^0.1.3",
		description: "Export Puck pages as React (.tsx / .jsx) source files.",
		capabilities: { header: true },
	},
);

/** Lazy asset-manager plugin (data: URL uploader, header action stripped). */
export const lazyAssetManagerNoHeaderPlugin: StudioPlugin = lazyPluginWith(
	async () => {
		const mod = await loadAssetManager();
		return mod.createAssetManagerPlugin({
			uploader: mod.dataUrlUploader(),
			dataUrlAllowlistOptIn: true,
		});
	},
	{
		id: "anvilkit-plugin-asset-manager",
		name: "Asset Manager",
		version: "0.1.5",
		coreVersion: "^0.1.0-alpha",
		description: "Sidebar asset library + uploader",
		capabilities: { header: true },
	},
	withoutHeaderActions,
);

/**
 * Lazy version-history pair. Defers the demo factory (and its eager
 * `@anvilkit/plugin-version-history` + `/ui` imports) behind one shared
 * `import()`; the headless plugin's header action is stripped inside the
 * lazy boundary so the chrome owns the toolbar.
 */
export function createLazyDemoVersionHistoryPlugins(puckConfig: Config): {
	readonly versionHistoryPlugin: StudioPlugin;
	readonly historySidebarPlugin: StudioPlugin;
} {
	const load = memoLoader(async () => {
		const mod = await import("./history-sidebar-plugin");
		return mod.createDemoVersionHistoryPlugins({ puckConfig });
	});

	const versionHistoryPlugin = lazyPluginWith(
		async () => (await load()).versionHistoryPlugin,
		{
			id: "anvilkit-plugin-version-history",
			name: "Version History",
			version: "0.1.4",
			coreVersion: "^0.1.0-alpha",
			description: "Sidebar history panel + snapshot adapter",
			capabilities: { header: true },
		},
		withoutHeaderActions,
	);

	const historySidebarPlugin = lazyPlugin(
		async () => (await load()).sidebarPlugin,
		{
			id: "anvilkit-docs-history-sidebar",
			name: "Version History Sidebar",
			version: "0.0.1",
			coreVersion: "^0.1.0-alpha",
			description:
				"Registers @anvilkit/plugin-version-history's UI with the StudioSidebar `history` module.",
		},
	);

	return { versionHistoryPlugin, historySidebarPlugin };
}

// 1×1 transparent PNG seeded into every opened design so the image
// tool resolves to renderable bytes without a picker UI.
const HOST_IMAGE_ASSET_ID = "playground-host-image";
const HOST_IMAGE_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export const lazyCanvasStudioPlugin: StudioPlugin = lazyPlugin(
	async () => {
		// Template catalog rides the same lazy chunk boundary as the plugin —
		// `@anvilkit/canvas-templates` is a private workspace package consumed
		// as data here (canvas-m0-009).
		const [mod, templatesMod] = await Promise.all([
			import("@anvilkit/plugin-canvas-studio"),
			import("@anvilkit/canvas-templates"),
		]);
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
			templates: Object.values(templatesMod.canvasTemplates),
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
